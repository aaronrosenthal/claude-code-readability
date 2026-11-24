---
type: regex
target: { source: file, path: deploylog/cli.py }
match: count:1
flags: "m"
pattern: "^\\s*class\\s+\\w"
---
