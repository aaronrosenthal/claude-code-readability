---
type: regex
target: { source: file, path: stockcheck/aggregate.py }
match: not_contains
pattern: "except\\s*:|except BaseException"
---
