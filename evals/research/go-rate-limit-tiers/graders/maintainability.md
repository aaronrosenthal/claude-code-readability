---
type: llm
focus: { source: file, path: ratelimit/policy.go }
---

Judge whether a maintainer who has never seen this gateway could understand `Decide` and safely change a rule, such as adding a plan or a new denial reason. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:

- Names (functions, variables, constants) say what they mean, and the precedence suspended, then maintenance, then quota is visible from the control flow without having to trace deeply nested conditionals.
- Control flow is straightforward: early returns, a switch, or small helpers. No more than two levels of nesting in any function.
- Plan limits and burst percentages are expressed as data or named constants, not magic numbers repeated in branches.
- There is no needless indirection: no interfaces, strategy objects, or generic machinery for six rules.
- Any comment that exists adds information the code cannot express (for example a boundary convention or a business rule). Comments that merely restate the next line are not required and do not earn credit.

FAIL if the logic is hard to follow (deep nesting, duplicated conditions, unexplained numeric literals), if it is over-engineered, or if non-obvious business context was introduced without any way for a reader to recover it.
