namespace Promotions;

public sealed record Coupon(
    string Code,
    decimal PercentOff,
    DateOnly ValidFrom,
    DateOnly ValidUntil,
    decimal MinimumSubtotal,
    bool NewCustomersOnly = false);
