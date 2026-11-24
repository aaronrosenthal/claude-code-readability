---
description: Add pop and iter to a MaybeUninit-backed ring buffer that already uses unsafe.
tags: [research, rust, unsafe-code]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our `ringbuf` crate has a fixed-capacity `RingBuffer<T>` in `src/ring.rs` that keeps its elements in `MaybeUninit` slots to avoid requiring `T: Default`. `push`, `peek` and `Drop` exist, but there is no way to take values back out or look at all of them. Please add:

- `pop(&mut self) -> Option<T>`: removes and returns the oldest value, moving ownership out of the buffer.
- `iter(&self)`: iterates over references to the stored values, oldest first, without consuming them.

Both have to work after the buffer has wrapped around, and values must be dropped exactly once. The tests in `tests/ring.rs` cover this; make them pass without changing the existing public API.

When you're done, run `cargo test` and save its complete output to `test-results.txt`.
