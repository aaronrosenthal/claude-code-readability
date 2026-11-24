---
type: llm
focus: { source: file, path: Promotions/CouponValidator.cs }
---

Judge whether a maintainer could understand `CouponValidator` after this change and safely add the next coupon rule. Do not reward or penalize the number of comments by itself; judge the code together with whatever comments exist. The file was already small and readable before the change, so the standard is that the change fits in and does not make it worse.

PASS only if all of these hold:

1. The new rule follows the existing pattern: one guard in `Validate` in the established order (after the existing rules) backed by a small, clearly named predicate helper, with the same style as `IsExpired` and friends.
2. The existing helpers and the existing guard clauses are left alone; no gratuitous reformatting, renaming, reordering, or restructuring of code unrelated to the new rule.
3. Names are accurate (for example the helper's name states what is true when it returns `true`), and the control flow stays a flat sequence of early returns with no nesting or combined conditions that are harder to scan.
4. Nothing was added that the code does not need: no narration comments restating self-evident lines, no new abstractions, options, or interfaces. The existing XML doc summary on `Validate` remains accurate.

FAIL if any condition is violated, for example rewriting `Validate` into a different structure, folding the new rule into an existing condition, or adding line-by-line commentary to code that already reads clearly.
