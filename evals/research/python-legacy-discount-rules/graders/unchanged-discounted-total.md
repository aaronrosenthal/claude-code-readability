---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "def discounted_total\\(order\\):\\n    gross = subtotal\\(order\\)\\n    rate = combined_rate\\(order\\)\\n    # ERP: invoices are rounded half-even to match the ERP ledger; half-up caused one-cent\\n    # reconciliation breaks in 2021\\.\\n    return \\(gross \\* \\(1 - rate\\)\\)\\.quantize\\(CENT, rounding=ROUND_HALF_EVEN\\)\\n"
---
