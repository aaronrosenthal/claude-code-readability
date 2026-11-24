---
type: llm
focus: { source: file, path: retention/report.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: a SQLite retention-cohort report: signup-month cohorts, distinct retained users per month offset, with bound query parameters.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The SQL is readable on its own: the month-offset arithmetic is in one identifiable place and the cohort and event filters are easy to find.
- All caller-supplied values are passed as bound parameters, never concatenated or formatted into the SQL.
- The Python that assembles the result rows is short and its handling of missing offsets (zero retained) is clear.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
