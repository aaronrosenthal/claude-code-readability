---
type: regex
target: { source: file, path: src/main/java/com/acme/shipping/AddressValidator.java }
match: not_contains
pattern: 'Carrier\.(?:EXPRESS_COURIER|FREIGHT|POSTAL_SERVICE)'
---
