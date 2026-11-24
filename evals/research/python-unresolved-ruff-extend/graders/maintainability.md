---
type: llm
focus: { source: file, path: tracking/delays.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: adding late_shipments to a package whose shared lint configuration (inherited from a monorepo path) is not available in this checkout.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The function is short, reuses the existing days_overdue helper instead of duplicating its logic, and its filter and ordering rules are easy to read.
- The grace period handling and validation are explicit.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.
- Whatever documentation the module carries, the public function's contract (what is returned, ordering, the ValueError) can be understood from its signature, name, or docstring. Given that the governing lint rules are unknown, a brief docstring on the public function is acceptable but not required; judge whether a maintainer could understand it.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
