---
type: llm
focus: { source: file, path: webhook/client.go }
---

Judge whether a maintainer could understand `Deliver` and safely change its retry policy (for example retrying 429, or adding jitter) without breaking signing or cancellation. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:

- The attempt loop is readable: one place decides whether a failure is retryable, one place waits between attempts, and one place performs the HTTP request. These are visible from names and structure.
- The body is marshalled and signed once, outside the loop, and the same bytes are reused on retries, which a reader can verify from the code.
- Context cancellation is handled where the wait happens and when a request fails, and does not depend on subtle timing.
- The response body is closed on every path through the request code.
- Names are descriptive (no single-letter variables beyond conventional `ctx`, `err`, `req`, `resp`), the constants such as the default attempt count are named, and there is no needless indirection (no interface layers, option frameworks, or retry libraries for this one call).
- A comment, where present, explains something the code cannot (for example why 4xx responses are permanent). Comments that echo the next line are neither required nor credited.

FAIL if the retry and cancellation logic is tangled in one deeply nested function, if error classification is spread over several places, if the code is over-engineered, or if essential rationale is lost.
