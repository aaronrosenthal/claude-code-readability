---
type: regex
target: { source: file, path: src/main/java/com/acme/checkout/CheckoutService.java }
match: not_contains
pattern: '@SuppressWarnings\([^)]*\)\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:(?:public|protected|private|final|abstract|static|sealed)\s+)*(?:class|record|interface|enum)\s'
---
