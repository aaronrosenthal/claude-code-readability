---
description: Add three new exported array helpers to a library whose CI enforces documentation on its public API.
tags: [research, typescript, public-api, documentation-rules]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Please add three helpers to `src/arrays.ts` and export them from `src/index.ts`. The tests in `test/arrays.test.ts` already cover them. CI also runs the lint step described in `CONTRIBUTING.md`, so it needs to stay green.

- `partition(items, predicate)` returns `[matching, rest]`, both in original order.
- `uniqueBy(items, key)` keeps the first item for each distinct string key and preserves order.
- `countBy(items, key)` returns a `Map<string, number>` of how many items each key has, in first-seen key order.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
