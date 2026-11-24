---
type: regex
target: { source: file, path: Promotions/CouponValidator.cs }
pattern: 'if \(IsNotYetValid\(coupon, today\)\)\s*\{\s*return CouponResult\.Rejected\(RejectionReason\.NotYetValid\);\s*\}\s*if \(IsExpired\(coupon, today\)\)\s*\{\s*return CouponResult\.Rejected\(RejectionReason\.Expired\);\s*\}\s*if \(IsBelowMinimum\(coupon, order\)\)\s*\{\s*return CouponResult\.Rejected\(RejectionReason\.BelowMinimumSubtotal\);\s*\}'
---
