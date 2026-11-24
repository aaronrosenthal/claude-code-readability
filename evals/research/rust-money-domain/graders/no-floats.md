---
type: regex
target: { source: file, path: src/money.rs }
match: not_contains
pattern: "\\bf(?:32|64)\\b|\\d\\.\\d+_?f"
---
