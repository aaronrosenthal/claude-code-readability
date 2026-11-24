---
type: llm
focus: { source: file, path: ratelimit/window.py }
---

You are reviewing the implementation of the following task as a maintainer who did not write it: a thread-safe sliding-window event counter with hit, count and allow operations, shared between threads.

Judge only whether a new maintainer could understand this code and change it safely. Do NOT reward or penalize the number of comments by itself; a file with no comments can pass and a file with many comments can fail. Judge the code and whatever documentation it carries.

PASS only if all of the following hold:
- It is clear from the code what the lock protects and that the check and the update in allow() happen under the same lock acquisition.
- Window expiry is implemented in one place and its boundary (exactly one window old is expired) is easy to verify.
- The data structure is simple and its choice is evident (for example a deque of timestamps per key).
- Names (functions, variables, parameters) say what they hold or do, with no cryptic abbreviations or misleading names.
- Control flow is straightforward: no deep nesting, no needless indirection, no helper classes, layers, or configuration objects that the task does not need, and no duplicated logic.
- Any documentation the project requires is present and says something the code does not already say.
- If the code relies on a threading assumption (what the lock guards, why the clock is read under it), that assumption is stated or evident from structure.

FAIL if any of the following hold:
- The intent of a non-obvious step cannot be recovered from the names, structure, or documentation.
- The code is more complicated than the task needs (extra abstractions, generic frameworks, speculative options).
- Required documentation or essential context is missing, or the documentation restates the code line by line instead of adding information.
- Existing behavior or context that other code or people rely on was removed or contradicted.

Answer PASS or FAIL with a one or two sentence justification that cites specific code.
