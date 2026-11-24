---
type: llm
focus: { source: file, path: src/main/java/com/acme/billing/Subscription.java }
---

Judge whether a maintainer who did not write this state machine could understand it and change a rule (for example, lengthen the grace period or add a new state) safely. Do not reward or penalize the number of comments by itself; judge the code together with whatever comments are present.

PASS only if all of these hold:

1. The durations (trial length, billing period, grace period) are named values, not unexplained literals scattered through the logic.
2. It is clear which states each operation is allowed from, ideally stated in one place per operation, and the stored status versus the time-derived status (expiry) are distinguishable by reading the code.
3. Control flow is straightforward: no deeply nested conditionals, no duplicated expiry checks that could drift apart, and no needless indirection (extra interfaces, transition tables, or strategy objects that a five-state machine does not need).
4. Names (fields, helpers, locals) describe what they hold; a reader can tell why a derived status is computed rather than stored without guessing.
5. Behavior that is not obvious from the code, such as the end instant counting as expired or reactivation starting a new period from now rather than from the old end, is discoverable from the code's structure or from a brief explanation.

FAIL if any condition is violated, for example magic numbers repeated in several methods, state checks spread across methods in inconsistent styles, or a rule whose boundary behavior a maintainer would have to reverse-engineer from the tests.
