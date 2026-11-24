---
type: regex
target: { source: file, path: src/arrays.ts }
match: not_contains
flags: m
pattern: "(?<!\\*/\\n)^export (?:async )?function\\b"
---
