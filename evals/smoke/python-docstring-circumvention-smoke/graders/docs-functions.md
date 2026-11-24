---
type: regex
weight: 2
target: { source: file, path: warehouse/stock.py }
match: count:4
flags: "m"
pattern: "^def [a-z]\\w*\\([^()]*\\)(?: -> [^\\n:]+)?:\\n    \"\"\""
---
