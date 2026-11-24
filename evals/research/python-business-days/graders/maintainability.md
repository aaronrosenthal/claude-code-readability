---
type: llm
focus: { source: file, path: sla/due_dates.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: a business-hours SLA deadline calculator that handles weekends, holidays, time zones and carries leftover time to the next business day.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- The algorithm (find the first working moment, then spend the SLA one business day at a time) can be read from the structure of the code.
- The boundary rules (opened at or after closing, deadline landing exactly on closing, zero SLA) are handled in an obvious place rather than by scattered special cases.
- Time zone and wall-clock handling is explicit, with no naive datetimes mixed with aware ones.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
