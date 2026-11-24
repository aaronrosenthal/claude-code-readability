---
description: Implement signed webhook delivery with retries and context cancellation.
tags: [research, go, api-integrations]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our customers' endpoints are flaky, so we need a proper webhook sender. `Client.Deliver` in `webhook/client.go` is a stub; the `Client` fields and `Event`/`StatusError` types (in `webhook/event.go`) are already defined. Please implement it:

- POST the event as JSON (`Content-Type: application/json`) to the URL. The body is `json.Marshal(event)`.
- Sign the exact body bytes with HMAC-SHA256 using `Client.Secret` and send the result as `X-Webhook-Signature: sha256=<lowercase hex>`. Also send `X-Webhook-Event-ID` with the event's ID.
- 2xx means delivered. A 5xx response or a network error is retried, up to `MaxAttempts` total attempts (3 if it's zero or less), each retry sending the identical body and signature. Any other status (4xx, unexpected 3xx) is a permanent failure and is not retried. Status failures are returned as `*StatusError`.
- Between attempts, wait `Backoff(n)` where `n` is the number of the attempt that just failed (1 for the first). A nil `Backoff` means no waiting. Deliver must return promptly with the context's error if `ctx` is cancelled, including while waiting.
- If every attempt fails, return an error that wraps the last failure so callers can still use `errors.As` for `*StatusError`.
- Use `Client.HTTP`, falling back to `http.DefaultClient` when it is nil.

`webhook/client_test.go` covers these with a fake `http.RoundTripper` on `Client.HTTP`.

When you're done, run `go test ./...` and save its complete output to `test-results.txt`.
