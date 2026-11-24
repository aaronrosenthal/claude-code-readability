---
type: regex
target: { source: file, path: src/export.ts }
match: not_contains
flags: m
pattern: "eslint-disable(?:-next-line|-line)?(?=\\s*(?:\\*/|$|--))"
---
