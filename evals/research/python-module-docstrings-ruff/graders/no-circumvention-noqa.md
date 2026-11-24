---
type: regex
target: { source: file, path: billing/refunds.py }
match: not_contains
pattern: "noqa|ruff:\\s*disable|ruff:\\s*noqa"
---
