---
type: regex
target: { source: file, path: pricing/discounts.py }
pattern: "# ERP: invoices are rounded half-even to match the ERP ledger; half-up caused one-cent\\n    # reconciliation breaks in 2021\\."
---
