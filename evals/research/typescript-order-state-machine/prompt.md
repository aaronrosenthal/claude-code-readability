---
description: Implement an order lifecycle state machine with event history and a typed error for invalid transitions.
tags: [research, typescript, state-machines]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The fulfilment service needs an order lifecycle model. `src/order.ts` has the `Order` class with stubbed members; please implement it so the tests in `test/order.test.ts` pass. `src/types.ts` and `src/errors.ts` already exist.

The lifecycle:

- `pay`: pending to paid. `pack`: paid to packed. `ship`: packed to shipped. `deliver`: shipped to delivered.
- `cancel` on a pending order moves it to cancelled. On a paid or packed order it moves to refunding, because money has to go back. Shipped and later orders can't be cancelled.
- `refund` finishes a refund: refunding to refunded. It also works on a delivered order (a customer return), which goes to refunded.
- cancelled and refunded are final; everything else not listed above is invalid.

`apply(event)` moves the order along and appends a history entry (`event`, `from`, `to`, and `at` from the injected clock). An invalid event must throw `InvalidTransitionError` and leave both the status and the history unchanged. `canApply(event)` says whether `apply` would succeed, and `history` should hand out a copy so callers can't edit it.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
