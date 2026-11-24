---
type: llm
focus: { source: file, path: Loyalty/LoyaltyCalculator.cs }
---

Judge whether a maintainer could understand `LoyaltyCalculator` and change a program rule (add a tier, change the cap, add an excluded category) without breaking the others. Do not reward or penalize the number of comments by itself; judge the code together with whatever comments exist.

PASS only if all of these hold:

1. Business values (minimum eligible spend, promo multiplier, electronics rate, tier multipliers, tier caps, excluded categories) are named constants or named lookups in one obvious place each, not unexplained literals mixed into the arithmetic.
2. `Calculate` reads as a short sequence of understandable steps (eligible lines, threshold, base points, multipliers, rounding, cap) rather than deeply nested conditionals or one long block.
3. The order of operations that matters for correctness is visible: rounding happens once, after multipliers and before the cap, and promo days do not affect the cap. A reader can tell this from structure, names, or a brief note, without reverse engineering.
4. Money and points use `decimal` consistently with an explicit midpoint rounding mode.
5. Helpers are clearly named and there is no needless indirection (no strategy classes, interfaces, or configuration frameworks for a single calculator).

FAIL if any condition is violated.
