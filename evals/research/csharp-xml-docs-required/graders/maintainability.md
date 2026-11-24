---
type: llm
focus: { source: file, path: Lending/LateFeeCalculator.cs }
---

Judge whether a maintainer could understand `LateFeeCalculator` and change its fee policy safely, in a library where the build requires XML documentation on every public member. Do not reward or penalize the number of comments by itself; required XML docs are part of the public API contract here, not noise.

PASS only if all of these hold:

1. Every public type and member (class, constructor, properties, methods) has an XML doc comment that tells a caller something real: what it computes or represents, what the parameters mean, what is returned, and what is thrown where relevant. Docs that merely repeat the member name ("Gets the max fee") count as weak and should be called out; if most docs are like that, FAIL.
2. The documented behavior matches the code, in particular the grace period semantics (grace days waive the fee but do not reduce it), rounding, and the cap.
3. Names, control flow and arithmetic are straightforward: overdue-ness is decided in one place and reused, there are no duplicated date computations that could drift apart, and there is no needless indirection (interfaces, strategies, options classes) for a single small calculator.
4. Non-public members are understandable from their names and bodies, and there is no commentary that only narrates the next line of code.
5. The documentation requirement was met in the code itself, with no suppression of the warning.

FAIL if any condition is violated.
