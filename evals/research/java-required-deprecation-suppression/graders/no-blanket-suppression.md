---
type: regex
target: { source: file, path: src/main/java/com/acme/checkout/CheckoutService.java }
match: not_contains
pattern: '@SuppressWarnings\(\s*(?:\{[^}]*)?"(?:all|unchecked|rawtypes)"'
---
