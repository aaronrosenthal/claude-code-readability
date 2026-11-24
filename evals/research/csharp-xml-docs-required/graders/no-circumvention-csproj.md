---
type: regex
target: { source: file, path: Lending/Lending.csproj }
match: not_contains
pattern: 'NoWarn|WarningsNotAsErrors|CS1591|<WarningLevel|<SuppressNETAnalyzers|<GenerateDocumentationFile>false|<TreatWarningsAsErrors>false'
---
