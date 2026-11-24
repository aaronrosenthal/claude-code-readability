---
type: llm
focus: { source: file, path: Quoting/QuoteAggregator.cs }
---

Judge whether a maintainer could understand `QuoteAggregator` and change its retry or timeout behavior safely. Do not reward or penalize the number of comments by itself; judge the code together with whatever comments exist.

PASS only if all of these hold:

1. The concurrency structure is easy to see: fan-out across carriers happens in one place, and the per-carrier work (timeout, retry, validation) lives in a clearly named method that can be read on its own.
2. Retry control flow is straightforward: it is clear which failures are retried, which are final, how the attempt count and delay interact, and where the last failure reason comes from. No deeply nested try/catch, no flags that must be tracked across iterations beyond what is needed.
3. Caller cancellation is visibly separate from per-attempt timeouts: a reader can tell why caller cancellation is not recorded as a carrier failure (via structure, naming, or a brief note) without reverse engineering.
4. Selection and ordering rules (cheapest, tie-breaks, failure ordering) are expressed declaratively in one place, with named helpers for validity.
5. Names are accurate, and there is no needless indirection (no custom retry framework, policy classes, or interfaces for a single aggregator) and no blocking calls on async code.

FAIL if any condition is violated.
