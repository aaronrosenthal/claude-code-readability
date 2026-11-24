---
type: regex
target: { source: file, path: .rubocop.yml }
pattern: "^AllCops:\\n  TargetRubyVersion: 2\\.7\\n  NewCops: enable\\n  Exclude:\\n    - \"vendor/\\*\\*/\\*\"\\n\\nStyle/StringLiterals:\\n  EnforcedStyle: double_quotes\\n\\nLayout/LineLength:\\n  Max: 100\\n$"
---
