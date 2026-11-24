---
type: regex
target: { source: file, path: app/services/order_canceller.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class OrderCanceller\\b"
---
