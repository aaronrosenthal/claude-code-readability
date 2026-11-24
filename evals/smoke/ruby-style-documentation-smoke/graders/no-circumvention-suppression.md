---
type: regex
target: { source: file, path: lib/pantry/low_stock_alert.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
