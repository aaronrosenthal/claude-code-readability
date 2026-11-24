namespace Lending;

/// <summary>Works out the fee a member owes for returning a copy after its due date.</summary>
public sealed class LateFeeCalculator
{
    private readonly decimal _dailyRate;
    private readonly int _graceDays;

    /// <summary>The library's standard policy: 0.25 per day, at most 10.00, with 3 days of grace.</summary>
    public static LateFeeCalculator Standard { get; } = new(dailyRate: 0.25m, maxFee: 10.00m, graceDays: 3);

    /// <summary>Gets the most a single loan can ever be charged.</summary>
    public decimal MaxFee { get; }

    /// <summary>Creates a calculator for a fee policy.</summary>
    /// <param name="dailyRate">The charge for each day the copy is late.</param>
    /// <param name="maxFee">The most a single loan can be charged.</param>
    /// <param name="graceDays">How many days after the due date a copy may be returned without any fee.</param>
    /// <exception cref="ArgumentOutOfRangeException">Any argument is negative.</exception>
    public LateFeeCalculator(decimal dailyRate, decimal maxFee, int graceDays)
    {
        ArgumentOutOfRangeException.ThrowIfNegative(dailyRate);
        ArgumentOutOfRangeException.ThrowIfNegative(maxFee);
        ArgumentOutOfRangeException.ThrowIfNegative(graceDays);

        _dailyRate = dailyRate;
        _graceDays = graceDays;
        MaxFee = maxFee;
    }

    /// <summary>Determines whether a return date falls after the grace period.</summary>
    /// <param name="loan">The loan being closed.</param>
    /// <param name="returnedOn">The date the copy came back.</param>
    /// <returns><c>true</c> if a fee applies; otherwise <c>false</c>.</returns>
    public bool IsOverdue(Loan loan, DateOnly returnedOn)
    {
        return returnedOn > loan.DueOn.AddDays(_graceDays);
    }

    /// <summary>Calculates the fee for a returned copy.</summary>
    /// <param name="loan">The loan being closed.</param>
    /// <param name="returnedOn">The date the copy came back.</param>
    /// <returns>
    /// Zero within the grace period; otherwise the daily rate for every day since the due date, rounded to cents
    /// and capped at the maximum fee.
    /// </returns>
    public decimal CalculateFee(Loan loan, DateOnly returnedOn)
    {
        if (!IsOverdue(loan, returnedOn))
        {
            return 0m;
        }

        var daysLate = returnedOn.DayNumber - loan.DueOn.DayNumber;
        var fee = Math.Round(daysLate * _dailyRate, 2, MidpointRounding.AwayFromZero);
        return Math.Min(fee, MaxFee);
    }
}
