---
type: regex
target: { source: file, path: .rubocop.yml }
pattern: "^AllCops:\\n  TargetRubyVersion: 2\\.7\\n  NewCops: enable\\n  Exclude:\\n    - \"vendor/\\*\\*/\\*\"\\n    - \"db/\\*\\*/\\*\"\\n\\nStyle/StringLiterals:\\n  EnforcedStyle: double_quotes\\n\\nLayout/LineLength:\\n  Max: 110\\n\\nMetrics/MethodLength:\\n  Max: 15\\n\\nMetrics/BlockLength:\\n  Exclude:\\n    - \"test/\\*\\*/\\*\"\\n\\nStyle/FrozenStringLiteralComment:\\n  Enabled: true\\n$"
---
