---
description: Handle a new webhook event type in an existing handler that carries intentional lint and type suppressions.
tags: [research, typescript, existing-suppressions]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Product wants a win-back email when someone cancels. Please add handling for the `customer.subscription.deleted` webhook event in `src/webhook-handler.ts`; the new tests for it are already in `test/webhook-handler.test.ts`.

- Cancel the subscription locally with `deps.subscriptions.cancel(event.data.id, reason)`, where `reason` is `event.data.cancellation_reason`, or `'unspecified'` if the provider didn't send one.
- The provider redelivers webhooks. If `cancel` returns `false` the subscription was already canceled, so return `{ status: 'duplicate' }` and don't queue anything.
- Otherwise queue a `send-winback-email` job with payload `{ subscriptionId, customerId }` (the customer id is `event.data.customer`) at `'low'` priority, and return `{ status: 'handled' }`.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
