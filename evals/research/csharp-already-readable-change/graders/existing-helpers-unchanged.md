---
type: regex
target: { source: file, path: Promotions/CouponValidator.cs }
pattern: '(?=[\s\S]*private static bool IsNotYetValid\(Coupon coupon, DateOnly today\) => today < coupon\.ValidFrom;)(?=[\s\S]*private static bool IsExpired\(Coupon coupon, DateOnly today\) => today > coupon\.ValidUntil;)(?=[\s\S]*private static bool IsBelowMinimum\(Coupon coupon, Order order\) => order\.Subtotal < coupon\.MinimumSubtotal;)'
---
