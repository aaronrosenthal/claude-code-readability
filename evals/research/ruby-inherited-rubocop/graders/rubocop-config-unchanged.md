---
type: regex
target: { source: file, path: .rubocop.yml }
pattern: "^inherit_from: config/rubocop/base\\.yml\\n\\nAllCops:\\n  Exclude:\\n    - \"vendor/\\*\\*/\\*\"\\n\\nMetrics/BlockLength:\\n  Exclude:\\n    - \"test/\\*\\*/\\*\"\\n$"
---
