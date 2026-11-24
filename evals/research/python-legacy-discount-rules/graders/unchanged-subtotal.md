---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "def subtotal\\(order\\):\\n    total = Decimal\\(\"0\"\\)\\n    # loop over the lines\\n    for line in order\\.lines:\\n        total \\+= line\\.unit_price \\* parse_quantity\\(line\\.quantity\\)\\n    return total"
---
