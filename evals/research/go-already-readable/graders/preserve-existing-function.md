---
type: regex
target: { source: file, path: pricing/pricing.go }
pattern: '\/\/ ApplyPercentOff reduces cents by percent, rounding the discount down so the\n\/\/ customer is never charged less than the advertised price\.\nfunc ApplyPercentOff\(cents int64, percent int\) \(int64, error\) \{\n\tif percent < 0 \|\| percent > 100 \{\n\t\treturn 0, ErrInvalidPercent\n\t\}\n\tdiscount := cents \* int64\(percent\) \/ 100\n\treturn cents - discount, nil\n\}'
---
