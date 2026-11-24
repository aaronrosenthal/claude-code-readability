---
type: regex
target: { source: file, path: pricing/pricing.go }
pattern: '// Subtotal returns the sum of all line totals\.\nfunc Subtotal\(lines \[\]Line\) int64 \{\n\tvar total int64\n\tfor _, l := range lines \{\n\t\ttotal \+= l\.UnitCents \* int64\(l\.Qty\)\n\t\}\n\treturn total\n\}'
---
