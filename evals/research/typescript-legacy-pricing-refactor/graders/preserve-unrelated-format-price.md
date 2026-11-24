---
type: regex
target: { source: file, path: src/pricing.ts }
pattern: "export function formatPrice\\(cents: number\\): string \\{\\n  return `\\$\\$\\{\\(cents / 100\\)\\.toFixed\\(2\\)\\}`;\\n\\}"
---
