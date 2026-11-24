---
type: llm
focus: { source: file, path: src/pricing.ts }
---

You are reviewing a hot-fix to a legacy tiered-pricing module. The task was to fix an off-by-one at tier boundaries while leaving the other exports unchanged. Judge whether a maintainer could understand `priceForUnits` and safely change it afterwards. Do not reward or penalize the number of comments by itself, and do not reward or penalize leaving the pre-existing comments or the commented-out block in place or removing them; judge only whether the result is clear and the fix is sound.

PASS only if all of these hold:

- The boundary handling is correct and legible: after reading the loop, a maintainer can tell that each tier's lower bound is the previous tier's `upTo` (not `upTo + 1`) and that `upTo` is the last unit included in a tier. The meaning of `upTo` and `lower` is not left ambiguous or contradictory (for example, a stale comment that now says something false about the code is a FAIL).
- The fix is focused: the loop structure and exports are recognisably the original, with no rewrite into a different algorithm, no new abstractions, and no changes to `formatPrice`, `averageUnitCents`, or the tier table.
- Any comments that remain are not misleading with respect to the final code. Any comments that were added explain something non-obvious (such as the boundary convention) and do not narrate trivial statements.
- No new dead code, debug output, or speculative options were introduced.

FAIL if any of the above is clearly violated.
