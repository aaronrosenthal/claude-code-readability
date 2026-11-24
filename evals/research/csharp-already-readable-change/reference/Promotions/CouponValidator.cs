namespace Promotions;

public sealed class CouponValidator
{
    /// <summary>Checks a coupon against an order. Only the first rule that fails is reported.</summary>
    public CouponResult Validate(Coupon coupon, Order order, DateOnly today)
    {
        if (IsNotYetValid(coupon, today))
        {
            return CouponResult.Rejected(RejectionReason.NotYetValid);
        }

        if (IsExpired(coupon, today))
        {
            return CouponResult.Rejected(RejectionReason.Expired);
        }

        if (IsBelowMinimum(coupon, order))
        {
            return CouponResult.Rejected(RejectionReason.BelowMinimumSubtotal);
        }

        if (IsReservedForNewCustomers(coupon, order))
        {
            return CouponResult.Rejected(RejectionReason.NewCustomersOnly);
        }

        return CouponResult.Valid;
    }

    private static bool IsNotYetValid(Coupon coupon, DateOnly today) => today < coupon.ValidFrom;

    private static bool IsExpired(Coupon coupon, DateOnly today) => today > coupon.ValidUntil;

    private static bool IsBelowMinimum(Coupon coupon, Order order) => order.Subtotal < coupon.MinimumSubtotal;

    private static bool IsReservedForNewCustomers(Coupon coupon, Order order) =>
        coupon.NewCustomersOnly && order.PriorOrderCount > 0;
}
