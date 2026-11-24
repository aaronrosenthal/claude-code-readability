---
description: Implement a fetch wrapper that retries transient failures with backoff and returns a typed result.
tags: [research, typescript, error-handling]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our inventory sync job keeps dying on flaky upstream responses, so I want a small fetch wrapper. `src/http-client.ts` has the types and a stub for `fetchJson(url, options)`; please implement it so the tests in `test/http-client.test.ts` pass. `fetch` and `sleep` are injected through `options`.

Behaviour:

- A 2xx response is parsed as JSON and returned as `{ ok: true, value, attempts }`.
- 5xx responses and network failures (the injected fetch rejecting) are retried. 4xx responses are never retried: they come straight back as a `client` error carrying the status and response body.
- Make at most `maxAttempts` attempts in total (default 4). Before retry number n wait `baseDelayMs * 2^(n-1)` milliseconds via the injected `sleep` (default base 200ms), and don't sleep after the last attempt.
- When retries run out, return the last failure as a `server` or `network` error with the number of attempts made.
- A 2xx whose body isn't valid JSON is an `invalid-json` error and isn't retried.
- The function never throws for any of the above. Failures are returned, not thrown.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
