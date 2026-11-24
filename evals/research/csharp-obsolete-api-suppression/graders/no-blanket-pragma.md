---
type: regex
target: { source: file, path: Shipping/LabelService.cs }
flags: m
match: not_contains
pattern: '#pragma\s+warning\s+disable[ \t]*(?:\r?$|//)|#pragma\s+warning\s+disable\s+CS0618[ \t]*,'
---
