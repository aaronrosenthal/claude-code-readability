---
description: Implement a bounded-concurrency job runner with ordered results, failure collection, and cancellation.
tags: [research, typescript, async-orchestration]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We generate thumbnails for uploaded images in batches and the current `Promise.all` over everything blows up memory. `src/batch.ts` has the types and a stub for `runJobs(jobs, worker, options)`; please implement it so the tests in `test/batch.test.ts` pass.

What it needs to do:

- Run `worker(job, signal)` for each job with at most `options.concurrency` running at once. When one finishes, the next job starts right away (no waiting for a whole group).
- `results[i]` is the worker's result for `jobs[i]`, so the output order matches the input order regardless of completion order. Jobs that failed or never started leave `undefined` in their slot.
- A worker that rejects must not stop the batch. Record `{ index, job, error }` in `failures`, ordered by index.
- If `options.signal` is aborted, don't start any more jobs; jobs already running are allowed to finish (they got the signal and can cancel themselves). `aborted` is `true` if the signal was aborted by the time the batch finished.
- Reject with a `RangeError` if `concurrency` isn't a positive integer.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
