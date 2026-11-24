---
description: Add a late-shipments feature to a package in a monorepo checkout with an unresolvable shared lint config.
tags: [research, python, unresolved-config, new-feature]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

I only have the `parcel-tracking` package checked out here, not the whole monorepo. Please implement `late_shipments(shipments, today, grace_days=1)` in `tracking/delays.py` for the carrier dashboard.

It returns the shipments that are not delivered and are more than `grace_days` past their promised date (use `days_overdue` from `tracking/status.py`), ordered most overdue first, with ties broken by tracking number. It accepts any iterable and returns a list. A negative `grace_days` raises `ValueError`.

The tests are in `tests/test_delays.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
