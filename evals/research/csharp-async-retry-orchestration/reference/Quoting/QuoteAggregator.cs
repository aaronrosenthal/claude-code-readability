namespace Quoting;

public sealed class QuoteAggregator
{
    private readonly IReadOnlyList<ICarrierClient> _clients;
    private readonly QuoteOptions _options;

    public QuoteAggregator(IEnumerable<ICarrierClient> clients, QuoteOptions options)
    {
        _clients = clients.ToList();
        _options = options;
    }

    public async Task<QuoteResult> GetBestQuoteAsync(QuoteRequest request, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();

        var outcomes = await Task.WhenAll(
            _clients.Select(client => QueryCarrierAsync(client, request, cancellationToken)));

        var best = outcomes
            .Select(outcome => outcome.Quote)
            .OfType<Quote>()
            .OrderBy(quote => quote.Price)
            .ThenBy(quote => quote.TransitDays)
            .ThenBy(quote => quote.Carrier, StringComparer.Ordinal)
            .FirstOrDefault();

        var failures = outcomes
            .Select(outcome => outcome.Failure)
            .OfType<CarrierFailure>()
            .OrderBy(failure => failure.Carrier, StringComparer.Ordinal)
            .ToList();

        return new QuoteResult(best, failures);
    }

    private async Task<CarrierOutcome> QueryCarrierAsync(
        ICarrierClient client, QuoteRequest request, CancellationToken cancellationToken)
    {
        var lastReason = string.Empty;

        for (var attempt = 1; attempt <= _options.MaxAttempts; attempt++)
        {
            try
            {
                var quote = await GetQuoteWithTimeoutAsync(client, request, cancellationToken);
                return IsValid(quote)
                    ? CarrierOutcome.Succeeded(quote)
                    : CarrierOutcome.Failed(client.Name, "invalid quote", attempt);
            }
            catch (TransientCarrierException ex)
            {
                lastReason = ex.Message;
            }
            catch (TimeoutException)
            {
                lastReason = "timed out";
            }
            catch (Exception ex) when (!cancellationToken.IsCancellationRequested)
            {
                return CarrierOutcome.Failed(client.Name, ex.Message, attempt);
            }

            if (attempt < _options.MaxAttempts)
            {
                await Task.Delay(_options.RetryDelay, cancellationToken);
            }
        }

        return CarrierOutcome.Failed(client.Name, lastReason, _options.MaxAttempts);
    }

    private async Task<Quote> GetQuoteWithTimeoutAsync(
        ICarrierClient client, QuoteRequest request, CancellationToken cancellationToken)
    {
        using var attemptCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        try
        {
            return await client
                .GetQuoteAsync(request, attemptCancellation.Token)
                .WaitAsync(_options.PerAttemptTimeout, cancellationToken);
        }
        finally
        {
            attemptCancellation.Cancel();
        }
    }

    private static bool IsValid(Quote quote) => quote.Price > 0 && quote.TransitDays >= 1;

    private sealed record CarrierOutcome(Quote? Quote, CarrierFailure? Failure)
    {
        public static CarrierOutcome Succeeded(Quote quote) => new(quote, null);

        public static CarrierOutcome Failed(string carrier, string reason, int attempts) =>
            new(null, new CarrierFailure(carrier, reason, attempts));
    }
}
