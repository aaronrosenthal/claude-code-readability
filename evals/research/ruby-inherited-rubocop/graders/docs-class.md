---
type: regex
target: { source: file, path: app/services/loyalty_member.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class LoyaltyMember\\b"
---
