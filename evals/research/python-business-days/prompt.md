---
description: Implement SLA due-date calculation over business hours, weekends, holidays and time zones.
tags: [research, python, date-time]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

`sla/due_dates.py` has a stub for `due_at(opened_at, sla, hours)`, which the ticketing system will use to stamp each ticket with its response deadline. The SLA clock only runs during the team's business hours (`BusinessHours`: an opening and closing time in the team's time zone, Monday to Friday except the listed holidays).

- `opened_at` is a timezone-aware datetime in any zone; convert it to the team's zone first. The result is a datetime in the team's zone.
- If the ticket is opened outside business hours (before opening, at or after closing, on a weekend or holiday), the clock starts at the next opening.
- `sla` is a `timedelta` of business time. Spend it day by day: whatever doesn't fit before closing carries over to the next business day's opening. A deadline that lands exactly on closing time stays on that day.
- A zero SLA is due at the moment the clock starts.
- Business hours are wall-clock hours, so a deadline after a daylight-saving change still falls at the right local time.

The tests are in `tests/test_due_dates.py`; `zoneinfo` is fine to use.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
