---
description: Add one narrowly scoped rule to a small, already clean C# validator.
tags: [research, csharp, small-change, already-readable]
runs: 3
max_turns: 30
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Marketing wants a welcome coupon that only works on a customer's first order. In the `Promotions` project, add a `NewCustomersOnly` flag to `Coupon` (it defaults to `false`, so existing coupons behave as before) and a matching `RejectionReason.NewCustomersOnly`. `CouponValidator.Validate` should reject a coupon with that flag when the order's `PriorOrderCount` is above zero. It should be checked after the existing rules, so expired or below-minimum coupons keep reporting those reasons.

`Tests/Program.cs` already covers this, so don't edit it.

When you're done, run `dotnet run --project Tests` and save its complete output to `test-results.txt`.
