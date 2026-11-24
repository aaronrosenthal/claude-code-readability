---
description: Implement a generic TTL cache that loads each missing key once under concurrent access.
tags: [research, go, concurrency]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our profile service hammers the user database whenever a popular key expires, because every request that misses calls the loader itself. `cache.Cache` in `cache/cache.go` is the in-process cache we want to put in front of it, but only the type and constructor signature exist so far. Please implement `Get`:

- `Get(key)` returns a cached value if it is younger than the TTL, otherwise it calls the loader and caches the result. Time comes from the injected `Clock` (see `cache/clock.go`), never from the `time` package directly, so tests can control it.
- If several goroutines call `Get` for the same key while it is being loaded, the loader must run once and all of them get that result.
- Loads for different keys must not block each other.
- Loader errors are returned to every caller waiting on that load and are not cached; the next `Get` tries again.

The tests in `cache/cache_test.go` cover these cases, including the concurrent one.

When you're done, run `go test ./...` and save its complete output to `test-results.txt`.
