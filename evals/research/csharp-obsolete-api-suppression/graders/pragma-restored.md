---
type: regex
target: { source: file, path: Shipping/LabelService.cs }
pattern: '#pragma\s+warning\s+disable\s+CS0618[\s\S]*#pragma\s+warning\s+restore\s+CS0618|^(?![\s\S]*#pragma\s+warning\s+disable)'
---
