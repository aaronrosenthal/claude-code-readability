---
type: llm
focus: { source: file, path: src/tickets-client.ts }
---

You are reviewing a paginated REST API client with rate-limit handling. Judge whether a maintainer could understand it and safely change it, for example by adding a `status` filter, honouring HTTP-date `Retry-After` values, or adding a second endpoint. Do not reward or penalize the number of comments by itself; judge whether the code and any comments present make the behaviour clear.

PASS only if all of these hold:

- Pagination, URL construction, request/retry handling, and error mapping are each in an identifiable place; a maintainer adding another endpoint could reuse the request-and-retry path without copying it.
- The 429 handling is easy to follow: where the delay comes from, what the default is, how the retry budget is counted and when it gives up, are readable without tracing control flow back and forth.
- `listAll` clearly yields lazily and terminates when there is no next cursor; there is no way to loop forever on a null cursor.
- Names are domain names (page, cursor, retry-after) and constants such as the page size and default delay are named rather than buried as magic numbers.
- No needless indirection: no generic paginator framework, no request-builder classes, no options nobody asked for.
- Comments, if any, explain something the code cannot say (for example the unit of `Retry-After`); they do not restate the line beneath them.

FAIL if any of the above is clearly violated, for example the retry logic is copy-pasted per method, the loop condition is hard to reason about, or the client is wrapped in layers of abstraction that the task did not need.
