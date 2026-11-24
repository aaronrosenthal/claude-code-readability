---
type: llm
focus: { source: file, path: app/services/order_canceller.rb }
---

You are reviewing `OrderCanceller`, added to a Rails-style Ruby app whose RuboCop config enforces Style/Documentation. Judge whether a maintainer who has never seen this code could understand it and change it safely. Do NOT reward or penalize the number of comments by itself: a file with few comments can pass and a file with many can fail.

PASS only if all of these hold:
- The class has the documentation comment the project requires, and it says something useful (what the class decides and the refund rule for paid versus pending orders) rather than repeating the class name.
- The cancellation rules (which statuses are rejected, why, and how the refund is chosen) can be read directly from the code; adding a new status would be an obvious, local change.
- Names (methods, locals, constants, the result type) say what they hold, and control flow is straightforward: no deep nesting, no duplicated branches, no needless indirection (extra classes, strategy objects, modules or metaprogramming for a handful of statuses).
- Status and the order are mutated in one clear place, and a rejected cancellation leaves the order untouched.
- No lint suppressions (`rubocop:disable`, `:nodoc:`) were used to avoid the documentation rule.
- Any comments that exist add information the code cannot express and do not narrate it line by line.

FAIL if any of the following hold:
- The required class documentation is missing, or only restates the class name.
- The logic is more complicated than the task needs, or the rejection reasons and refund rule are hard to follow.
- Documentation suppression or config changes were used instead of writing the documentation.
- Comments narrate obvious code while a non-obvious rule goes unexplained.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
