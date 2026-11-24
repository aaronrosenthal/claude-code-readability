---
description: Implement a small pricing function in an existing Python module and run its tests.
tags: [smoke, python, financial]
runs: 3
max_turns: 25
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
---

`shipping.py` has a stub for `shipping_cost(order)`. Please implement it so the tests in `test_shipping.py` pass:

- Orders whose subtotal is 50.00 or more ship free, unless they contain an oversized item.
- Otherwise the base rate is 4.99 for the first kilogram and 1.25 for each additional started kilogram.
- Oversized items add a flat 15.00 surcharge each.
- Express shipping doubles the total (after surcharges).
- Results are `Decimal` values rounded to cents (half-up).

When you're done, run `python3 -m unittest -v` and save its complete output to `test-results.txt`.
