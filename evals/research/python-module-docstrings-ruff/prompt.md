---
description: Add a refunds module to a billing package whose CI runs ruff with docstring rules.
tags: [research, python, lint-docstrings, new-module]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

Please add `billing/refunds.py` to the billing package with two public functions:

- `refundable_amount(invoice, prior_refunds)`: how much of the invoice can still be refunded: the invoice total minus the amounts of prior refunds that belong to that invoice, never below zero.
- `issue_refund(invoice, prior_refunds, amount, reason, issued_on)`: returns a new `Refund` (see `billing/models.py`). It raises `ValueError` if the invoice isn't `"paid"`, if the amount isn't positive, if it is more than the refundable amount, or if `issued_on` is more than 90 days after the invoice was issued.

The tests are already in `tests/test_refunds.py`. CI runs `ruff check .` on the repo, so the new module needs to pass that.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
