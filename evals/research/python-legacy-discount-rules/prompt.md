---
description: Add a first-order discount rule to a legacy pricing module.
tags: [research, python, legacy-code-modification]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

We're launching a welcome offer for the wholesale portal: customers placing their very first order (`customer.orders_placed == 0`) get 10% off. It should work like the existing discount rules in `pricing/discounts.py`: it stacks with the bulk and loyalty rates, and the combined rate stays subject to the existing cap.

The module is old and a bit messy, so please keep the change focused on what the offer needs. The new tests are in `tests/test_discounts.py` next to the existing ones.

When you're done, run `python3 -m unittest discover -s tests -v` and save its complete output to `test-results.txt`.
