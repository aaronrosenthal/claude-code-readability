---
type: regex
target: { source: file, path: app/services/payment_reconciler.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class PaymentReconciler\\b"
---
