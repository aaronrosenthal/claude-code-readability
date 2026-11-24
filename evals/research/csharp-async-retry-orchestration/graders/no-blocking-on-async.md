---
type: regex
target: { source: file, path: Quoting/QuoteAggregator.cs }
match: not_contains
pattern: 'Thread\.Sleep|\.Result\b|\.Wait\(\)|GetAwaiter\(\)\s*\.GetResult\(\)|async\s+void|Task\.Run\('
---
