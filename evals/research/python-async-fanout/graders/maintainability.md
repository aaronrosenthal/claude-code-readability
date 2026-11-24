---
type: llm
focus: { source: file, path: stockcheck/aggregate.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: an asyncio fan-out that queries several inventory services concurrently with a per-call timeout, collects partial failures, and merges results by service priority.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- Querying, error capture, and merging are separable steps, and the concurrency (one task per service) is evident from the structure.
- The merge rule (lowest priority number wins, ties go to the earlier service) is easy to see in the code.
- Exceptions are handled narrowly enough that cancellation is not swallowed, and failure messages are produced in one place.
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
