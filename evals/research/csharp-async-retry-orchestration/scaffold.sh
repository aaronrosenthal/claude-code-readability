#!/usr/bin/env bash
set -euo pipefail
cat > '.gitignore' <<'EOF_FIXTURE'
bin/
obj/
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/CarrierFailure.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed record CarrierFailure(string Carrier, string Reason, int Attempts);
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/ICarrierClient.cs' <<'EOF_FIXTURE'
namespace Quoting;

public interface ICarrierClient
{
    string Name { get; }

    Task<Quote> GetQuoteAsync(QuoteRequest request, CancellationToken cancellationToken);
}
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/Quote.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed record Quote(string Carrier, decimal Price, int TransitDays);
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/QuoteAggregator.cs' <<'EOF_FIXTURE'
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

    public Task<QuoteResult> GetBestQuoteAsync(QuoteRequest request, CancellationToken cancellationToken)
    {
        throw new NotImplementedException();
    }
}
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/QuoteOptions.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed record QuoteOptions(TimeSpan PerAttemptTimeout, int MaxAttempts, TimeSpan RetryDelay);
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/QuoteRequest.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed record QuoteRequest(string OriginPostalCode, string DestinationPostalCode, int WeightGrams);
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/QuoteResult.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed record QuoteResult(Quote? Best, IReadOnlyList<CarrierFailure> Failures);
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/Quoting.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

</Project>
EOF_FIXTURE
mkdir -p 'Quoting'
cat > 'Quoting/TransientCarrierException.cs' <<'EOF_FIXTURE'
namespace Quoting;

public sealed class TransientCarrierException : Exception
{
    public TransientCarrierException(string message)
        : base(message)
    {
    }
}
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Program.cs' <<'EOF_FIXTURE'
using Quoting;

var failures = new List<string>();
var count = 0;

async Task Test(string name, Func<Task> body)
{
    count++;
    try
    {
        await body();
    }
    catch (Exception ex)
    {
        failures.Add($"{name}: {ex.GetType().Name}: {ex.Message}");
    }
}

void AssertEqual<T>(T expected, T actual)
{
    if (!EqualityComparer<T>.Default.Equals(expected, actual))
    {
        throw new Exception($"expected {expected} but was {actual}");
    }
}

var request = new QuoteRequest("10115", "75001", 2000);
var fast = new QuoteOptions(TimeSpan.FromMilliseconds(200), MaxAttempts: 3, RetryDelay: TimeSpan.Zero);

Task<QuoteResult> Run(QuoteOptions options, CancellationToken token, params ICarrierClient[] clients) =>
    new QuoteAggregator(clients, options).GetBestQuoteAsync(request, token);

Task<QuoteResult> RunFast(params ICarrierClient[] clients) => Run(fast, CancellationToken.None, clients);

await Test("the cheapest valid quote wins", async () =>
{
    var result = await RunFast(
        Scripted.Returns("A", 12.50m, 3),
        Scripted.Returns("B", 9.90m, 5),
        Scripted.Returns("C", 11.00m, 2));
    AssertEqual(new Quote("B", 9.90m, 5), result.Best);
    AssertEqual(0, result.Failures.Count);
});

await Test("ties go to the faster carrier, then to the first name", async () =>
{
    var result = await RunFast(
        Scripted.Returns("Zeta", 10m, 2),
        Scripted.Returns("Alpha", 10m, 2),
        Scripted.Returns("Slow", 10m, 4));
    AssertEqual("Alpha", result.Best?.Carrier);
});

await Test("carriers are queried concurrently", async () =>
{
    var started = 0;
    var bothStarted = new TaskCompletionSource();

    Func<int, CancellationToken, Task<Quote>> meet = async (_, token) =>
    {
        if (Interlocked.Increment(ref started) == 2)
        {
            bothStarted.SetResult();
        }
        await bothStarted.Task.WaitAsync(token);
        return new Quote("X", 5m, 1);
    };

    var options = new QuoteOptions(TimeSpan.FromSeconds(1), MaxAttempts: 1, RetryDelay: TimeSpan.Zero);
    var result = await Run(options, CancellationToken.None, new Scripted("A", meet), new Scripted("B", meet));
    AssertEqual(0, result.Failures.Count);
    AssertEqual(true, result.Best is not null);
});

await Test("transient failures are retried", async () =>
{
    var flaky = new Scripted("Flaky", (attempt, _) => attempt < 3
        ? throw new TransientCarrierException("503")
        : Task.FromResult(new Quote("Flaky", 8m, 2)));
    var result = await RunFast(flaky);
    AssertEqual(new Quote("Flaky", 8m, 2), result.Best);
    AssertEqual(3, flaky.Attempts);
    AssertEqual(0, result.Failures.Count);
});

await Test("a carrier that keeps failing is reported and the others still count", async () =>
{
    var down = new Scripted("Down", (attempt, _) => throw new TransientCarrierException($"503 on attempt {attempt}"));
    var result = await RunFast(down, Scripted.Returns("Up", 7m, 4));
    AssertEqual(new Quote("Up", 7m, 4), result.Best);
    AssertEqual(3, down.Attempts);
    AssertEqual(new CarrierFailure("Down", "503 on attempt 3", 3), result.Failures.Single());
});

await Test("other errors are not retried", async () =>
{
    var broken = new Scripted("Broken", (_, _) => throw new InvalidOperationException("bad postal code"));
    var result = await RunFast(broken, Scripted.Returns("Ok", 7m, 4));
    AssertEqual(1, broken.Attempts);
    AssertEqual(new CarrierFailure("Broken", "bad postal code", 1), result.Failures.Single());
    AssertEqual("Ok", result.Best?.Carrier);
});

await Test("errors thrown before a task is returned are captured too", async () =>
{
    var client = new ThrowingClient("Eager");
    var result = await RunFast(client, Scripted.Returns("Ok", 7m, 4));
    AssertEqual(new CarrierFailure("Eager", "no route", 1), result.Failures.Single());
});

await Test("an attempt that hangs times out and is retried", async () =>
{
    var slowStart = new Scripted("SlowStart", async (attempt, token) =>
    {
        if (attempt == 1)
        {
            await Task.Delay(Timeout.Infinite, token);
        }
        return new Quote("SlowStart", 6m, 3);
    });
    var result = await RunFast(slowStart);
    AssertEqual(2, slowStart.Attempts);
    AssertEqual(new Quote("SlowStart", 6m, 3), result.Best);
    AssertEqual(0, result.Failures.Count);
});

await Test("a carrier that always hangs is reported as timed out", async () =>
{
    var hung = Scripted.Hangs("Hung");
    var result = await RunFast(hung, Scripted.Returns("Ok", 7m, 4));
    AssertEqual(new CarrierFailure("Hung", "timed out", 3), result.Failures.Single());
    AssertEqual("Ok", result.Best?.Carrier);
});

await Test("a carrier that ignores cancellation still times out", async () =>
{
    var stubborn = new Scripted("Stubborn", async (_, _) =>
    {
        await Task.Delay(TimeSpan.FromSeconds(5));
        return new Quote("Stubborn", 1m, 1);
    });
    var options = new QuoteOptions(TimeSpan.FromMilliseconds(50), MaxAttempts: 1, RetryDelay: TimeSpan.Zero);
    var result = await Run(options, CancellationToken.None, stubborn, Scripted.Returns("Ok", 7m, 4));
    AssertEqual(new CarrierFailure("Stubborn", "timed out", 1), result.Failures.Single());
});

await Test("invalid quotes are reported, not retried and never chosen", async () =>
{
    var free = new Scripted("Free", (_, _) => Task.FromResult(new Quote("Free", 0m, 2)));
    var instant = new Scripted("Instant", (_, _) => Task.FromResult(new Quote("Instant", 3m, 0)));
    var result = await RunFast(free, instant, Scripted.Returns("Ok", 7m, 4));
    AssertEqual("Ok", result.Best?.Carrier);
    AssertEqual(1, free.Attempts);
    AssertEqual(1, instant.Attempts);
    AssertEqual(2, result.Failures.Count);
    AssertEqual(new CarrierFailure("Free", "invalid quote", 1), result.Failures[0]);
    AssertEqual(new CarrierFailure("Instant", "invalid quote", 1), result.Failures[1]);
});

await Test("with no usable quote there is no best quote", async () =>
{
    var result = await RunFast(
        new Scripted("B", (_, _) => throw new InvalidOperationException("x")),
        new Scripted("A", (_, _) => throw new InvalidOperationException("y")));
    AssertEqual(true, result.Best is null);
    AssertEqual("A,B", string.Join(",", result.Failures.Select(f => f.Carrier)));
});

await Test("no carriers means no quote and no failures", async () =>
{
    var result = await RunFast();
    AssertEqual(true, result.Best is null);
    AssertEqual(0, result.Failures.Count);
});

await Test("the retry delay is honored between attempts", async () =>
{
    var options = new QuoteOptions(TimeSpan.FromSeconds(1), MaxAttempts: 2, RetryDelay: TimeSpan.FromMilliseconds(150));
    var flaky = new Scripted("Flaky", (attempt, _) => attempt == 1
        ? throw new TransientCarrierException("503")
        : Task.FromResult(new Quote("Flaky", 8m, 2)));
    var watch = System.Diagnostics.Stopwatch.StartNew();
    await Run(options, CancellationToken.None, flaky);
    AssertEqual(true, watch.ElapsedMilliseconds >= 140);
});

await Test("cancelling the caller's token cancels the whole operation", async () =>
{
    var options = new QuoteOptions(TimeSpan.FromSeconds(30), MaxAttempts: 3, RetryDelay: TimeSpan.Zero);
    var hung = Scripted.Hangs("Hung");
    using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));
    try
    {
        await Run(options, cts.Token, hung, Scripted.Returns("Ok", 7m, 4));
        throw new Exception("expected OperationCanceledException");
    }
    catch (OperationCanceledException)
    {
    }
});

await Test("an already cancelled token never reaches the carriers", async () =>
{
    var client = Scripted.Returns("Ok", 7m, 4);
    using var cts = new CancellationTokenSource();
    cts.Cancel();
    try
    {
        await Run(fast, cts.Token, client);
        throw new Exception("expected OperationCanceledException");
    }
    catch (OperationCanceledException)
    {
    }
    AssertEqual(0, client.Attempts);
});

if (failures.Count > 0)
{
    foreach (var failure in failures)
    {
        Console.WriteLine($"FAIL {failure}");
    }
    Console.WriteLine($"{failures.Count} of {count} TESTS FAILED");
    return 1;
}

Console.WriteLine($"ALL {count} TESTS PASSED");
return 0;

sealed class Scripted : ICarrierClient
{
    private readonly Func<int, CancellationToken, Task<Quote>> _behavior;
    private int _attempts;

    public Scripted(string name, Func<int, CancellationToken, Task<Quote>> behavior)
    {
        Name = name;
        _behavior = behavior;
    }

    public string Name { get; }

    public int Attempts => Volatile.Read(ref _attempts);

    public static Scripted Returns(string name, decimal price, int days) =>
        new Scripted(name, (_, _) => Task.FromResult(new Quote(name, price, days)));

    public static Scripted Hangs(string name) =>
        new(name, async (_, token) =>
        {
            await Task.Delay(Timeout.Infinite, token);
            return new Quote(name, 1m, 1);
        });

    public Task<Quote> GetQuoteAsync(QuoteRequest request, CancellationToken cancellationToken)
    {
        var attempt = Interlocked.Increment(ref _attempts);
        try
        {
            return _behavior(attempt, cancellationToken);
        }
        catch (Exception ex)
        {
            return Task.FromException<Quote>(ex);
        }
    }
}

sealed class ThrowingClient : ICarrierClient
{
    public ThrowingClient(string name)
    {
        Name = name;
    }

    public string Name { get; }

    public Task<Quote> GetQuoteAsync(QuoteRequest request, CancellationToken cancellationToken) =>
        throw new InvalidOperationException("no route");
}
EOF_FIXTURE
mkdir -p 'Tests'
cat > 'Tests/Tests.csproj' <<'EOF_FIXTURE'
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
  </PropertyGroup>

  <ItemGroup>
    <ProjectReference Include="../Quoting/Quoting.csproj" />
  </ItemGroup>

</Project>
EOF_FIXTURE
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
