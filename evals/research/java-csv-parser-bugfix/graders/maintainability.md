---
type: llm
focus: { source: file, path: src/main/java/com/acme/csv/CsvReader.java }
---

Judge whether a maintainer who has never seen this CSV reader could understand it and change it safely. Do not reward or penalize the number of comments by itself; judge whether the code, together with whatever comments are present, communicates what it needs to.

PASS only if all of these hold:

1. Names (methods, fields, locals, constants) say what they hold or do, and the escaped-quote and quoted-line-break handling can be located and understood by reading the code.
2. Control flow is straightforward: the parsing states (inside quotes, outside quotes, end of record) are easy to follow, with no deeply nested conditionals, no flag combinations that are hard to reason about, and no needless indirection or abstraction for a reader this small.
3. Line-number tracking for `CsvFormatException` is consistent and a reader can tell why it is maintained where it is.
4. Context the code cannot express is preserved: the original note that blank lines are intentionally skipped (and why) is still present or clearly replaced by an equally informative explanation.
5. The change does not add behavior beyond the two requested fixes in a way that makes the reader harder to follow.

FAIL if any condition is violated, for example code whose quote-handling logic requires guessing, a state machine with unexplained magic values, or the blank-line rationale silently dropped.
