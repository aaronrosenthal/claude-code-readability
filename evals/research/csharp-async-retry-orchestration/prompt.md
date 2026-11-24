---
description: Implement concurrent multi-carrier quote fetching with timeouts, retries and cancellation.
tags: [research, csharp, async, error-handling, retry]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

At checkout we want to show the customer the cheapest shipping quote, but right now each carrier is called one after another and one slow carrier holds everything up. `QuoteAggregator.GetBestQuoteAsync` in the `Quoting` project is a stub; please implement it. The tests in `Tests/Program.cs` cover the details; don't edit them.

What it should do:

- Ask all carriers (`ICarrierClient`) for a quote at the same time.
- Limit each attempt to `QuoteOptions.PerAttemptTimeout`. A carrier that doesn't answer in time counts as a transient failure, even if it ignores the cancellation token it was given.
- Retry transient failures (`TransientCarrierException` or a timeout) until `MaxAttempts` attempts have been made in total, waiting `RetryDelay` between attempts. Any other exception is not retried.
- A quote is only valid if its price is above zero and it takes at least one day. An invalid quote is a failure with reason `invalid quote` and is not retried.
- Return a `QuoteResult` with the cheapest valid quote (ties go to the fewer transit days, then the carrier name in ordinal order), or `null` if none is usable, plus a `CarrierFailure` for every carrier that didn't produce a valid quote, ordered by carrier name. A failure's `Attempts` is how many attempts were made and its `Reason` is the last error's message, `timed out`, or `invalid quote`.
- Cancelling the caller's `CancellationToken` cancels the whole operation with `OperationCanceledException`; that is not recorded as a carrier failure.

When you're done, run `dotnet run --project Tests` and save its complete output to `test-results.txt`.
