---
type: llm
focus: { source: file, path: pricing/pricing.go }
---

This package was already tidy before the task. Judge whether it is still one a maintainer can understand and safely change after the new `FreeShippingGap` function was added. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:

- `FreeShippingGap` is small and obviously correct: it reuses `Subtotal` instead of duplicating the summing loop, and its zero floor is easy to see.
- Its name, parameter names and behavior match the documented contract (cents needed, zero when already met).
- The existing functions (`Subtotal`, `ApplyPercentOff`, `WithTax`) and their doc comments are intact, including the rationale for rounding in `ApplyPercentOff` and `WithTax`.
- There is no new indirection, helper type, option struct or generalization beyond the one function.
- A new doc comment, if present, describes the contract. Narration comments inside the function body are neither required nor credited.

FAIL if the new function duplicates existing logic, adds unneeded abstraction, alters or removes existing documentation or code unrelated to the request, or leaves the package harder to follow than before.
