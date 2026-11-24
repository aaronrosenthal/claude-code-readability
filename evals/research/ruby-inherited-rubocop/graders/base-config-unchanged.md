---
type: regex
target: { source: file, path: config/rubocop/base.yml }
pattern: "^AllCops:\\n  TargetRubyVersion: 2\\.7\\n  NewCops: enable\\n\\nStyle/StringLiterals:\\n  EnforcedStyle: double_quotes\\n\\nLayout/LineLength:\\n  Max: 100\\n\\nStyle/DocumentationMethod:\\n  Enabled: true\\n$"
---
