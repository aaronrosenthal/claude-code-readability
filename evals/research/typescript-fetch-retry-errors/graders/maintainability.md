---
type: llm
focus: { source: file, path: src/http-client.ts }
---

You are reviewing a retrying fetch wrapper. Judge whether a maintainer could understand it and safely change it, for example by adding jitter, honouring a `Retry-After` header, or treating 408 as retryable. Do not reward or penalize the number of comments by itself; judge whether the code and any comments present make the behaviour clear.

PASS only if all of these hold:

- It is clear from reading the code which outcomes are retried (5xx, network failure) and which are final (2xx, 4xx, invalid JSON), and that decision lives in one identifiable place rather than being scattered.
- The retry loop is easy to follow: the attempt counter, the stop condition, and the backoff delay computation are readable at a glance, with no off-by-one risk hidden in clever arithmetic or recursion.
- The discriminated-union error construction is straightforward, with no casts that hide an unhandled case, and no catch-all that swallows errors it should surface.
- Names are domain names (attempt, backoff, retryable) and nothing is misleading.
- No needless indirection: no retry-policy class hierarchy, no generic middleware pipeline, no options nobody asked for.
- Comments, if any, explain something the code cannot say; they do not restate the line beneath them.

FAIL if any of the above is clearly violated, for example if the loop mixes parsing, classification and sleeping in one deeply nested block that is hard to modify, or if the solution wraps a simple loop in layers of abstraction.
