---
description: Fix a timestamp parser that returns Invalid Date on iOS Safari 15 for the legacy API's date format.
tags: [research, typescript, browser-compatibility]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We got this support ticket and I'd like it fixed today:

> **#4821** Invoice history shows "Unknown date" for every invoice on my iPhone (iOS 15, Safari). It's fine on my laptop in Chrome. Example row: INV-20931, issued "2024-03-05 14:30:00".

The legacy billing API sends timestamps like `2024-03-05 14:30:00` (UTC, no zone marker), and `parseLegacyTimestamp` in `src/legacy-timestamps.ts` just hands the string to `Date.parse`. Please fix it so it works everywhere. While you're there: on other browsers that same string is read as the viewer's local time, which is also wrong; it should always be UTC.

The `parse` argument exists so tests can stand in for a stricter engine. Update the parser so the tests in `test/legacy-timestamps.test.ts` pass. Besides the plain `YYYY-MM-DD HH:MM:SS` form, the API occasionally sends fractional seconds and an explicit offset (`+02:00`), and some endpoints already send proper ISO 8601, which must keep working.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
