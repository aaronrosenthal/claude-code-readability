---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "def loyalty_rate\\(customer\\):\\n    # TODO clean this up\\n    return LOYALTY_RATES\\.get\\(customer\\.tier, Decimal\\(\"0\"\\)\\)"
---
