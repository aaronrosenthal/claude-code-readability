---
type: regex
target: { source: file, path: Loyalty/LoyaltyCalculator.cs }
match: not_contains
pattern: '\b(?:double|float)\b|\d\.\d+[dDfF]\b'
---
