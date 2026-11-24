namespace Loyalty;

public sealed class LoyaltyCalculator
{
    private const decimal MinimumEligibleSpend = 5.00m;
    private const decimal PromoDayMultiplier = 2m;
    private const decimal ElectronicsPointsPerUnit = 0.5m;

    private readonly HashSet<DateOnly> _promoDays;

    public LoyaltyCalculator(IEnumerable<DateOnly> promoDays)
    {
        _promoDays = promoDays.ToHashSet();
    }

    public PointsAward Calculate(Order order, LoyaltyTier tier)
    {
        var eligibleLines = order.Lines.Where(line => !IsExcluded(line.Category)).ToList();
        var eligibleSpend = eligibleLines.Sum(NetAmount);
        if (eligibleSpend < MinimumEligibleSpend)
        {
            return new PointsAward(0, eligibleSpend, CapApplied: false);
        }

        var basePoints = eligibleLines.Sum(line => NetAmount(line) * PointsPerUnit(line.Category));
        var multiplier = TierMultiplier(tier) * (_promoDays.Contains(order.PlacedOn) ? PromoDayMultiplier : 1m);
        var points = (int)Math.Round(basePoints * multiplier, MidpointRounding.AwayFromZero);

        var cap = PointsCap(tier);
        return points > cap
            ? new PointsAward(cap, eligibleSpend, CapApplied: true)
            : new PointsAward(points, eligibleSpend, CapApplied: false);
    }

    private static bool IsExcluded(ProductCategory category) =>
        category is ProductCategory.GiftCard or ProductCategory.Alcohol or ProductCategory.Tobacco;

    private static decimal NetAmount(OrderLine line) =>
        Math.Max(0m, line.UnitPrice * line.Quantity - line.Discount);

    private static decimal PointsPerUnit(ProductCategory category) =>
        category == ProductCategory.Electronics ? ElectronicsPointsPerUnit : 1m;

    private static decimal TierMultiplier(LoyaltyTier tier) => tier switch
    {
        LoyaltyTier.Bronze => 1.0m,
        LoyaltyTier.Silver => 1.25m,
        LoyaltyTier.Gold => 1.5m,
        LoyaltyTier.Platinum => 2.0m,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null),
    };

    private static int PointsCap(LoyaltyTier tier) => tier switch
    {
        LoyaltyTier.Bronze => 500,
        LoyaltyTier.Silver => 1000,
        LoyaltyTier.Gold => 2000,
        LoyaltyTier.Platinum => 5000,
        _ => throw new ArgumentOutOfRangeException(nameof(tier), tier, null),
    };
}
