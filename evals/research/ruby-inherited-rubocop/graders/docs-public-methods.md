---
type: regex
target: { source: file, path: app/services/loyalty_member.rb }
pattern: "^(?=[\\s\\S]*#(?!\\s*rubocop)[^\\n]*\\n[ \\t]*def tier\\b)(?=[\\s\\S]*#(?!\\s*rubocop)[^\\n]*\\n[ \\t]*def points_to_next_tier\\b)(?=[\\s\\S]*#(?!\\s*rubocop)[^\\n]*\\n[ \\t]*def perks\\b)"
---
