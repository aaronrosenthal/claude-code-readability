---
type: regex
target: { source: file, path: .pylintrc }
match: not_contains
flags: "i"
pattern: "docstring"
---
