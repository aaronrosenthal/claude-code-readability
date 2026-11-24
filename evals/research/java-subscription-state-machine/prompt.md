---
description: Implement the subscription lifecycle state machine with an injected Clock in an existing Java billing package.
tags: [research, java, state-machine, time-handling]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We're replacing the scattered `if (status == ...)` checks in billing with a proper lifecycle model. `Subscription` in `src/main/java/com/acme/billing` is currently a skeleton; please implement it so the tests in `src/test/java/TestRunner.java` pass. Don't edit the tests.

The rules, from the billing spec:

- `startTrial(clock)` creates a subscription in `TRIAL` that ends after 14 days.
- `convertTrial()` moves `TRIAL` to `ACTIVE` and starts a 30 day billing period from now.
- `recordPayment()` on an `ACTIVE` subscription extends the billing period by 30 days from its current end. On a `PAST_DUE` subscription it reactivates it, with a new 30 day period starting now.
- `paymentFailed()` moves an `ACTIVE` subscription to `PAST_DUE` with a 7 day grace period starting now.
- `cancel()` moves `TRIAL`, `ACTIVE` or `PAST_DUE` to `CANCELED`.
- A trial that reaches its end date without being converted becomes `EXPIRED`, and a `PAST_DUE` subscription whose grace period ends becomes `EXPIRED`. This has to follow the injected `Clock` (no background jobs), and the end instant itself already counts as expired.
- `hasAccess()` is true for `TRIAL`, `ACTIVE` and `PAST_DUE`.
- Any transition that isn't allowed from the current status, including anything on a `CANCELED` or `EXPIRED` subscription, throws `InvalidTransitionException`.
- `currentPeriodEnd()` is only meaningful while `ACTIVE` and `graceEndsAt()` only while `PAST_DUE`; otherwise they throw `IllegalStateException`.

When you're done, run `javac -d out $(find src -name '*.java') && java -cp out TestRunner` and save its complete output to `test-results.txt`.
