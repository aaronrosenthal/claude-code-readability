---
type: llm
focus: { source: file, path: src/proration.ts }
---

You are reviewing the implementation of `prorateMidCycleChange` in a billing codebase. Judge whether a new maintainer could understand it and change it safely, for example to add a third line item or change the rounding rule. Do not reward or penalize the number of comments by itself; judge whether the code and any comments that are present make the intent clear.

PASS only if all of these hold:

- Names describe their domain meaning (cycle days, remaining days, credit versus charge, cents) and no name is misleading.
- The control flow is straightforward: the validation, the proration arithmetic, and the line construction are each easy to find and follow, with no needless indirection, no speculative abstractions, and no duplicated arithmetic that could drift apart.
- The rounding rule (nearest cent, halves away from zero, integer arithmetic) is implemented in one place and is recognisable as that rule, either from the code itself or from a brief explanation. A reader should not have to reverse-engineer the formula to confirm it matches the stated rule.
- Any non-obvious handling (for example avoiding a negative zero credit) is either self-evident from a well-named construct or explained, so a maintainer would not "simplify" it away and reintroduce the bug.
- Existing helpers such as `daysBetween` are reused rather than reimplemented.
- Any comments present add information that the code cannot express; they do not merely restate the line beneath them.

FAIL if any of the above is clearly violated, for example the rounding is spread across several places or hidden behind opaque magic numbers, or the code is padded with wrappers and options that nothing uses.
