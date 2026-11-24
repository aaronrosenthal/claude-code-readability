---
type: llm
focus: { source: file, path: src/money.rs }
---

Judge whether a maintainer who has never seen this crate could understand `Money` in `src/money.rs` and change it safely. Do not reward or penalize the number of comments by itself; judge whether the code and any documentation that is present explain what a reader needs.

PASS only if all of these hold:
- `checked_add`, `checked_sub` and `allocate` are implemented with integers only, and names (variables, helpers) say what they hold.
- The currency check is not copy-pasted in a way that could drift apart between `checked_add` and `checked_sub`.
- The allocation algorithm can be followed from the code, and the rule that matters to callers (shares sum exactly to the original amount, where leftover cents go, zero ratios receive nothing) is discoverable either from the code structure or from a short doc on `allocate`.
- Control flow is straightforward: no needless abstraction layers, traits, builders or generics for what is a few small functions; no dead code or leftover scaffolding.
- Pre-existing code (`Currency`, `MoneyError`, accessors) is not rewritten without reason.

FAIL if any condition is violated, if the code is correct but opaque (cryptic names, clever arithmetic with no way for a reader to see why it conserves the total), or if it is padded with indirection that a maintainer would have to read through.
