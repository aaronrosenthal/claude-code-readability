---
type: regex
target: { source: file, path: ledger/summary.py }
match: not_contains
pattern: "\\bfloat\\("
---
