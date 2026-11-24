---
type: regex
target: { source: file, path: lib/billing/renewal_calculator.rb }
pattern: "# HISTORY: Paystream submits charges at 02:00 UTC on the renewal date and\\n\\s*# rejects any charge dated in the past \\(INC-2231\\), so a renewal that falls\\n\\s*# on today counts as already taken and the following one is returned\\."
---
