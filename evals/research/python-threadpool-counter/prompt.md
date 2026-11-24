---
description: Implement a thread-safe sliding-window request counter used from a thread pool.
tags: [research, python, concurrency]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The API gateway needs a per-key sliding-window counter. `ratelimit/window.py` has the `SlidingWindowCounter` class as a stub; the README explains where it's used. Handlers run on a `ThreadPoolExecutor`, and one counter instance is shared by all of them.

- `hit(key)` records an event now and returns how many events for that key are inside the window, including this one.
- `count(key)` returns how many events for that key are inside the window without recording anything.
- `allow(key, limit)` records an event and returns `True` only if fewer than `limit` events were in the window beforehand; otherwise it records nothing and returns `False`. Under concurrent calls the limit must never be exceeded.
- An event stops counting once it is `window_seconds` old (exactly that old counts as expired).
- Take the time from the injected `clock` so tests can control it.

The tests, including ones that hammer a shared counter from many threads, are in `tests/test_window.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
