---
type: regex
target: { source: file, path: app/services/invoice_generator.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class InvoiceGenerator\\b"
---
