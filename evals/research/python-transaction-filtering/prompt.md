---
description: Implement a monthly per-category spending summary from bank transactions.
tags: [research, python, data-filtering, financial-calculations]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

`ledger/summary.py` has a stub for `monthly_category_summary(transactions, rates, base_currency="USD")` and I need it for the finance team's monthly report. It should return `{"YYYY-MM": {category: total_spent}}` as `Decimal` values, with these rules:

- Only money leaving the account counts as spending (negative amounts). Report totals as positive numbers.
- Skip internal transfers (`kind == "transfer"`).
- Skip charges that were reversed: a transaction with `kind == "reversal"` has `reverses` set to the id of the charge it cancels. Neither the charge nor the reversal counts, even when the reversal posts in a later month.
- Convert other currencies to the base currency with `rates` (units of base currency per one unit of the currency). A currency with no rate should raise `ValueError`.
- Round half-up to cents once per month and category, after summing, not per transaction.

The tests are in `tests/test_summary.py`.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
