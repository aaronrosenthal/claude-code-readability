---
type: regex
target: { source: file, path: app/services/tax_calculator.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
