---
description: Add a new public class to a C# library whose build requires XML documentation on every public member.
tags: [research, csharp, xml-docs-required, new-class]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Circulation wants late fees calculated in code rather than at the desk. Please add a public `LateFeeCalculator` class to the `Lending` library (a new file next to `LoanLedger.cs` is fine). `Tests/Program.cs` already has tests for the behavior, so don't edit them; they use this API:

- `new LateFeeCalculator(decimal dailyRate, decimal maxFee, int graceDays)`; negative arguments throw `ArgumentOutOfRangeException`.
- `bool IsOverdue(Loan loan, DateOnly returnedOn)` is true when the return date is later than the due date plus the grace days.
- `decimal CalculateFee(Loan loan, DateOnly returnedOn)` is zero while the loan isn't overdue. Once it is, the fee covers every day since the due date (grace days are only a waiver, not a discount), rounded to cents, half away from zero, and never above `maxFee`.
- `MaxFee` property exposing the configured maximum.
- `LateFeeCalculator.Standard`, the standard policy: 0.25 per day, at most 10.00, 3 days of grace.

Heads up that the `Lending` project is configured to treat warnings as errors, so the build has to come out clean.

When you're done, run `dotnet run --project Tests` and save its complete output to `test-results.txt`.
