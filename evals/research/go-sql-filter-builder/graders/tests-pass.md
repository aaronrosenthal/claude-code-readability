---
type: regex
weight: 3
target: { source: file, path: test-results.txt }
pattern: "^(?![\\s\\S]*\\bFAIL\\b)[\\s\\S]*(^|\\n)ok\\s"
---
