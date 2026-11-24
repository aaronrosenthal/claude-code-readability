---
type: regex
target: { source: file, path: webhook/client.go }
match: not_contains
pattern: "//\\s*nolint"
---
