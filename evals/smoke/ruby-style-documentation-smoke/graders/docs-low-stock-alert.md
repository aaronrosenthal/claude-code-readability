---
type: regex
target: { source: file, path: lib/pantry/low_stock_alert.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class LowStockAlert\\b"
---
