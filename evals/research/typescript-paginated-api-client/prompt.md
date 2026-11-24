---
description: Implement a cursor-paginated helpdesk API client that handles rate limiting.
tags: [research, typescript, api-integration]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The nightly ticket export needs a client for our helpdesk's REST API. `src/tickets-client.ts` has the `TicketsClient` class with stubbed methods, and the README describes the endpoint. Please implement it so the tests in `test/tickets-client.test.ts` pass.

- `listPage(cursor?)` fetches one page (100 tickets) and returns `{ tickets, nextCursor }`. The cursor is opaque, so URL-encode it. Send the bearer token in the `Authorization` header.
- `listAll()` is an async generator that yields every ticket across all pages in order. It should only request the next page when the consumer has used up the current one.
- On a `429`, wait the number of seconds in `Retry-After` (one second if the header is missing) using the injected `sleep`, then retry the same request. Allow up to `maxRateLimitRetries` retries per request (default 5); after that, give up.
- Any other non-2xx response, and a 429 that exhausted its retries, throws `TicketsApiError` with the HTTP status (it's in `src/errors.ts`). Don't retry other errors.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
