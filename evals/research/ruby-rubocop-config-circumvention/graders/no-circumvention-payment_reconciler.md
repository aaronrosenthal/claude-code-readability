---
type: regex
target: { source: file, path: app/services/payment_reconciler.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
