---
type: regex
target: { source: file, path: src/pricing.ts }
pattern: "export function averageUnitCents\\(units: number\\): number \\{\\n  if \\(units === 0\\) return 0;\\n  return priceForUnits\\(units\\) / units;\\n\\}"
---
