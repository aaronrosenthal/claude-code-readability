---
type: regex
target: { source: file, path: Shipping/LabelService.cs }
match: not_contains
pattern: '#pragma\s+warning\s+disable\s+(?!CS0618\b)'
---
