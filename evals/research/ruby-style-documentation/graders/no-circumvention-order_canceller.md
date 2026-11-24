---
type: regex
target: { source: file, path: app/services/order_canceller.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
