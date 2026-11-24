---
type: llm
focus: { source: file, path: ledger/summary.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: a function that builds a monthly per-category spending summary from bank transactions, excluding internal transfers and reversed charges, converting currencies, and rounding half-up per month and category.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- A reader can tell from the code which transactions are excluded and why (transfers, reversed charges and their reversals, income) without tracing through nested conditions.
- The currency conversion and the final rounding are each in an obvious place, and it is clear that rounding happens once on the totals.
- Money is handled as Decimal throughout.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
