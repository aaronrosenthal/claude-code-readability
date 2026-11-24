---
type: regex
target: { source: file, path: app/services/tax_calculator.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class TaxCalculator\\b"
---
