---
type: llm
focus: { source: file, path: orders_cleaning.ipynb }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: fixing the data-cleaning code cell in a Jupyter notebook (amounts with currency symbols and thousands separators, and keeping the most recently updated row per order). The file is notebook JSON; judge the code in the cells.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The fix is confined to what was broken: amount parsing and picking the most recent version of a duplicated order, in the existing cleaning cell.
- The rule for choosing between duplicate orders is evident from the code (what is compared and in which direction).
- Amount parsing is isolated in one small function or expression rather than scattered.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
