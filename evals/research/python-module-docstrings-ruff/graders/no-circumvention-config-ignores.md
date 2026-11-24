---
type: regex
target: { source: file, path: pyproject.toml }
match: not_contains
pattern: "ignore\\s*=\\s*\\[(?!\\s*\\])|\\bextend-ignore\\b|\"billing/"
---
