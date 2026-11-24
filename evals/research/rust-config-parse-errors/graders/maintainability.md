---
type: llm
focus: { source: file, path: src/config.rs }
---

Judge whether a maintainer who has never seen `relayd` could understand the config parser in `src/config.rs` and change it safely, for example by adding a new key or a new error case. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:
- The path from input text to `ServiceConfig` can be followed top to bottom: reading lines, validating keys, then converting values. Functions and variables have names that say what they do or hold.
- Adding a new setting would mean touching an obvious, small number of places; the per-key conversion rules (port range, non-zero workers, accepted log levels) are each easy to find.
- Error handling uses `?` and the existing `ConfigError` variants, with line numbers kept; there are no `unwrap`/`expect`/panics on user input.
- `Display` messages and the `Error` impl are present and straightforward.
- No needless indirection: no macros, traits, generic frameworks or wrapper types where a few plain functions suffice, and no dead code.
- Anything a reader could not infer from the code (for example why a duplicate is reported at its second occurrence, if the solution depends on it) is stated somewhere, either in the structure or a short comment. Absence of comments alone is not a failure, and presence of comments alone is not a pass.

FAIL if any condition is violated, or if the code is correct but one long function with nested matching that a maintainer would have to trace line by line.
