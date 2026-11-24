---
type: regex
target: { source: file, path: app/services/loyalty_member.rb }
match: not_contains
pattern: "rubocop:\\s*(?:disable|todo)|:nodoc:"
---
