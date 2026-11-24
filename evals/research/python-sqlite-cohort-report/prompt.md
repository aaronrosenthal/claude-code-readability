---
description: Implement a monthly signup-cohort retention report over a SQLite analytics database.
tags: [research, python, database-queries]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Product wants a retention report from our analytics SQLite export. `retention/report.py` has a stub for `cohort_retention(conn, first_cohort, last_cohort, event_name, max_offset=3)`; the tables are in `retention/schema.py`.

A cohort is the month a user signed up (`"YYYY-MM"`). For every cohort from `first_cohort` to `last_cohort` (inclusive) that has at least one user, return a tuple `(cohort, cohort_size, retained)` sorted by cohort, where `retained[k]` is how many distinct users in that cohort did at least one `event_name` event in the calendar month `k` months after their signup month (`k = 0` is the signup month itself). `retained` has `max_offset + 1` entries. Activity before the signup month or beyond `max_offset` is ignored.

`event_name` comes from a query-string parameter in the dashboard, so don't build SQL from it. The tests use an in-memory database and live in `tests/test_report.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
