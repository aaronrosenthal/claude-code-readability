---
type: regex
target: { source: file, path: pyproject.toml }
match: not_contains
pattern: "select|ignore|per-file|lint\\]"
---
