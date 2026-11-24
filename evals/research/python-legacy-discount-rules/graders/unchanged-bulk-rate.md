---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "def bulk_rate\\(total_quantity\\):\\n    # go through the tiers\\n    for minimum, rate in BULK_TIERS:\\n        if total_quantity >= minimum:\\n            return rate\\n    return Decimal\\(\"0\"\\)"
---
