---
description: Implement mid-cycle plan change proration in integer cents.
tags: [research, typescript, financial-calculations]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Customers can switch plans in the middle of a billing cycle, and we need to produce the invoice lines for it. `src/proration.ts` has a stub for `prorateMidCycleChange(change)`; please implement it so the tests in `test/proration.test.ts` pass. Dates are ISO strings and `src/dates.ts` already has a day-difference helper.

How it should work:

- The cycle runs from `cycleStart` up to but not including `cycleEnd`. The plan change takes effect at the start of `changeDate`, so that day is billed on the new plan.
- Proration is day-based: `remainingDays / cycleDays` of the monthly price, where `remainingDays` counts `changeDate` through the end of the cycle.
- Return two lines, in this order: a credit for the unused part of the old plan (negative amount, description `Credit: unused <old plan name>`) and a charge for the remaining part of the new plan (description `Charge: remaining <new plan name>`), plus `totalCents`, the sum of the two.
- All money is integer cents. Round each line to the nearest cent separately, with exact halves rounding away from zero (so a credit of 33.5 cents becomes -34). Don't use floating point for the proration itself.
- A `changeDate` before the cycle starts or on/after `cycleEnd` should throw a `RangeError`.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
