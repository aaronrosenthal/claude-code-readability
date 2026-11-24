---
type: regex
target: { source: file, path: .rubocop.yml }
match: not_contains
pattern: "Style/Documentation|inherit_from|rubocop_todo"
---
