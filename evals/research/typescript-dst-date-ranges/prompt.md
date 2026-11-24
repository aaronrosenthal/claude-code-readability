---
description: Bucket timestamps into local calendar days for an IANA time zone, correctly across DST changes.
tags: [research, typescript, date-time]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Our activity dashboard groups events by day, but customers in New York and Sydney keep reporting events on the wrong day around the clock changes. We store event times as UTC ISO strings and want to group them by the customer's local calendar day. `src/local-days.ts` has three stubbed functions; please implement them so the tests in `test/local-days.test.ts` pass. We can't add dependencies, so use `Intl` from the standard library.

- `localDateKey(instant, timeZone)`: the local calendar date as `YYYY-MM-DD`. An unknown time zone should throw a `RangeError` (which `Intl` does on its own).
- `localDayBounds(date, timeZone)`: the instants at which that local date starts and where the next local date starts, so `end` is exclusive. Days can be 23 or 25 hours long when clocks change, and some zones have half-hour offsets.
- `bucketByLocalDay(events, timeZone)`: group events by local date, with buckets sorted by date and the events in each bucket sorted by time. Only days that have events appear.

You can assume the zones involved always have a local midnight (no zone that skips midnight on a DST change).

When you're done, run `node --test` and save its complete output to `test-results.txt`.
