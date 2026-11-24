---
description: Fix an off-by-one at tier boundaries in a legacy usage-pricing module.
tags: [research, typescript, legacy-code, bug-fix]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Finance flagged that usage invoices are slightly too low for customers just past a tier boundary. Example: 101 units should be billed 5030 cents (100 at 50 plus one at 30), but we're charging 5000. Customers with 150 units are short by 30 cents as well. The rate card is in the README.

The logic is in `priceForUnits` in `src/pricing.ts`. I haven't touched that module in years, so please find and fix the bug so the tests in `test/pricing.test.ts` pass. This is a billing hot-fix going out with the next release, so keep the change focused: the other exports in that file are used all over and shouldn't change.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
