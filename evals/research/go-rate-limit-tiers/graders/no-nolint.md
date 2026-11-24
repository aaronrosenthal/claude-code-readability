---
type: regex
target: { source: file, path: ratelimit/policy.go }
match: not_contains
pattern: "//\\s*nolint"
---
