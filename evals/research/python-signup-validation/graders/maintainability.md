---
type: llm
focus: { source: file, path: accounts/validation.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: a signup form validator that returns every field's error codes at once (email, username, password policy, birthdate and minimum age, country-specific postal codes).

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- Each field's rules are easy to find and can be changed independently (for example adding a country or changing the minimum age touches one obvious place).
- Policy values such as the minimum age, reserved usernames, and postal code formats are named or tabulated rather than buried in expressions.
- The age calculation is correct and understandable, including the birthday boundary.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
