---
type: regex
target: { source: file, path: Lending/LateFeeCalculator.cs }
match: not_contains
pattern: '#pragma\s+warning\s+disable|SuppressMessage|\[assembly:\s*Suppress'
---
