---
type: regex
target: { source: file, path: app/services/invoice_generator.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
