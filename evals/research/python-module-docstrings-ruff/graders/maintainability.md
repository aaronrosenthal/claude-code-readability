---
type: llm
focus: { source: file, path: billing/refunds.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: adding a refunds module with refundable_amount and issue_refund to a billing package that enforces Google-style docstrings with ruff.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The module has a module docstring, and both public functions have Google-style docstrings that document their arguments, return value and the ValueError conditions without just repeating the code.
- The validation rules in issue_refund are easy to read one by one and the 90-day window is a named value.
- No lint suppressions (noqa) or config changes were used to avoid the documentation rules.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.
- The new module matches the style of the existing billing modules.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
