---
type: llm
focus: { source: file, path: cache/cache.go }
---

Judge whether a maintainer could understand `Cache.Get` and safely change it (for example to add `Delete` or a max-size limit) without introducing a race or a deadlock. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:

- The locking discipline can be understood from the code (and from a comment only where the code cannot show it): which fields the mutex guards, that the loader is never run while the mutex is held, and how waiters learn the result of an in-flight load.
- Names are clear (the type that tracks an in-flight load, the fields, the helper functions), and there are no leftover generic names such as `data`, `tmp` or `x`.
- Control flow is straightforward: lock and unlock pairs are easy to match, with no early return leaving the mutex locked.
- No needless indirection or machinery beyond what the feature needs (no extra goroutines per key, no channel-of-channels, no third-party-style abstractions).
- The injected clock is used for every time read.
- Where the code makes a non-obvious concurrency decision, such as deliberately releasing the lock around the loader, a reader can recover why from either the structure or a short comment. Comments that merely repeat `Lock()` or `Unlock()` are neither required nor credited.

FAIL if the synchronization is hard to reason about, if a lock is held during the loader call, if there is unneeded complexity, or if essential reasoning is buried with no way for the reader to recover it.
