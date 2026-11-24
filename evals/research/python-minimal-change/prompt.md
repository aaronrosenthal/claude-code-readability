---
description: Add a --since date filter to an existing small CLI helper.
tags: [research, python, minimal-change]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Can you add a `--since YYYY-MM-DD` option to the `deploylog` CLI? It should only show entries from that date onward (the whole of that day included), and it should combine with the existing `--level` and `--service` filters. A malformed date should be rejected by the argument parser with its usual usage error.

The existing code is in `deploylog/cli.py`; I've already added tests for the new option to `tests/test_cli.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
