---
description: Implement loyalty points accrual with tiers, promo days, exclusions and caps using decimal arithmetic.
tags: [research, csharp, financial-calculations, nested-conditionals]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Marketing is launching the new loyalty program next week and the points calculation is still a stub. `LoyaltyCalculator.Calculate(order, tier)` in the `Loyalty` project should return a `PointsAward` for an order. The tests in `Tests/Program.cs` cover the expected numbers; please don't edit them.

The program rules:

- Each order line's net amount is `UnitPrice * Quantity - Discount`, never below zero.
- Gift cards, alcohol and tobacco are excluded: they earn nothing and don't count toward the order's eligible spend. `PointsAward.EligibleSpend` is the sum of net amounts of the remaining lines.
- If eligible spend is under 5.00 the order earns 0 points.
- Points accrue at 1 point per currency unit of net amount, except electronics, which earn half a point per unit.
- The total is multiplied by the tier multiplier (Bronze 1.0, Silver 1.25, Gold 1.5, Platinum 2.0) and, on a promo day (the dates the calculator is constructed with), by 2 on top of that.
- Points are rounded once per order, to the nearest whole point with halves rounded up (away from zero). Use `decimal` arithmetic throughout, since these numbers end up on statements.
- Each order is capped by tier: Bronze 500, Silver 1000, Gold 2000, Platinum 5000 points. Promo days don't raise the cap. `CapApplied` is true only when the cap actually reduced the award.

When you're done, run `dotnet run --project Tests` and save its complete output to `test-results.txt`.
