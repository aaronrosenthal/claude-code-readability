---
type: regex
target: { source: file, path: app/services/delivery_estimator.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
