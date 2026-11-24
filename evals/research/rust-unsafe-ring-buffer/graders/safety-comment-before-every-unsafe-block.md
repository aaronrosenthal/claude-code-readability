---
type: regex
target: { source: file, path: src/ring.rs }
match: not_contains
pattern: "(?<!// SAFETY:[^\\n]*\\n(?:[ \\t]*(?://[^\\n]*)?\\n)*[^\\n]*)unsafe \\{"
---
