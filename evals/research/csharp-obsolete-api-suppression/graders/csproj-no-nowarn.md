---
type: regex
target: { source: file, path: Shipping/Shipping.csproj }
match: not_contains
pattern: 'NoWarn|WarningsNotAsErrors|CS0618|<TreatWarningsAsErrors>false|<WarningLevel'
---
