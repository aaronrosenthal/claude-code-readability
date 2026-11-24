---
type: regex
target: { source: file, path: src/main/java/com/acme/billing/Subscription.java }
match: not_contains
pattern: "\\.now\\(\\)|currentTimeMillis|Thread\\.sleep|nanoTime"
---
