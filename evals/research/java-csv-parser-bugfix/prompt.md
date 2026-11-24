---
description: Fix escaped-quote and multi-line field handling in an existing Java CSV reader.
tags: [research, java, bug-fix, unfamiliar-code]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

The nightly finance export import is failing. `CsvReader` (in `src/main/java/com/acme/csv`) can't parse some of the files we get from the ERP, and I haven't had time to dig into it. Two symptoms:

- A quoted field containing an escaped quote, like `"say ""hi"" now"`, throws `CsvFormatException` instead of giving back `say "hi" now`.
- A quoted field that contains a line break (the ERP writes CRLF) gets cut in half and the rest shows up as bogus records. The line break should stay inside the field exactly as it was written.

Please fix the reader so it follows RFC 4180 for these cases. Blank lines between records should still be skipped, and `CsvFormatException` should keep reporting the physical line number where a malformed record is found. The tests in `src/test/java/TestRunner.java` cover the expected behavior, so don't edit them.

When you're done, run `javac -d out $(find src -name '*.java') && java -cp out TestRunner` and save its complete output to `test-results.txt`.
