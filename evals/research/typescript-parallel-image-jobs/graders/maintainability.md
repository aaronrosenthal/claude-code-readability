---
type: llm
focus: { source: file, path: src/batch.ts }
---

You are reviewing a bounded-concurrency job runner. Judge whether a maintainer could understand it and safely change it, for example by adding a per-job timeout or a fail-fast mode. Do not reward or penalize the number of comments by itself; judge whether the code and any comments present make the behaviour clear.

PASS only if all of these hold:

- The scheduling model is easy to follow: a reader can tell how the concurrency limit is enforced, how the next job is picked, and why indices stay consistent with the results array, without simulating the event loop in their head.
- Shared mutable state (the next-index counter, the results array, the failures list) is small, clearly named, and only touched in obvious places. There is no race-prone read-then-write across an `await`.
- Abort handling is explicit and in one place; it is clear that running jobs finish and queued jobs are skipped.
- Input validation, scheduling, and result assembly are separable at a glance. No single deeply nested block does all three.
- No needless indirection: no custom queue or semaphore class, no event emitters, no extra options beyond what was asked.
- Comments, if any, explain something the code cannot say; they do not restate the line beneath them.

FAIL if any of the above is clearly violated, for example a hand-rolled promise-pool with manual resolve/reject bookkeeping that is hard to verify, or a solution wrapped in unnecessary classes.
