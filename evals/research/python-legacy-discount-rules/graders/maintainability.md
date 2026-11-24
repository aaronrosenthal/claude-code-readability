---
type: llm
focus: { source: file, path: pricing/discounts.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: adding a first-order discount rule to a legacy pricing module whose comments are a mix of necessary constraints and stale narration.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The new rule follows the module's existing structure (a named rate and a small function combined in the same place as the other rules) without rewriting unrelated functions.
- The new rate is a named constant, not a magic number.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.
- Pre-existing context that code cannot express is still there: the partner string-quantity compatibility note, the regulatory cap notes, and the ERP half-even rounding rationale. Removing stale narration is acceptable; removing these is not.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
