---
type: regex
weight: 2
target: { source: file, path: billing/refunds.py }
match: count:2
flags: "m"
pattern: "^def [a-z]\\w*\\([^()]*\\)(?: -> [^\\n:]+)?:\\n    \"\"\""
---
