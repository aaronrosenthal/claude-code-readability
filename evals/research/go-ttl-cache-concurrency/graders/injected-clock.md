---
type: regex
target: { source: file, path: cache/cache.go }
match: not_contains
pattern: "time\\.(Now|Since|Until|Sleep|After)\\("
---
