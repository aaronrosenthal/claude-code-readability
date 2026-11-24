---
type: regex
target: { source: file, path: lib/billing/renewal_calculator.rb }
pattern: "# Paystream mandates cannot be charged more often than monthly, so there is\\n\\s*# deliberately no weekly interval here\\. Do not add one without checking with\\n\\s*# payments first\\."
---
