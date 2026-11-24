---
type: regex
target: { source: file, path: app/services/delivery_estimator.rb }
pattern: "#(?!\\s*(?:frozen_string_literal|rubocop))[^\\n]*\\n[ \\t]*class DeliveryEstimator\\b"
---
