---
type: regex
target: { source: file, path: orders/query.go }
match: not_contains
pattern: "//\\s*(nolint|#nosec|nosec)"
---
