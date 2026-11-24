---
type: regex
target: { source: file, path: warehouse/stock.py }
match: not_contains
pattern: "pylint:\\s*disable|noqa|pylint:\\s*skip-file"
---
