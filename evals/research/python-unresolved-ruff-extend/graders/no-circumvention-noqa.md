---
type: regex
target: { source: file, path: tracking/delays.py }
match: not_contains
pattern: "noqa|ruff:\\s*disable"
---
