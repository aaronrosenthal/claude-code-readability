---
type: regex
target: { source: file, path: orders/query.go }
match: not_contains
pattern: "Sprintf\\([^)]*(Search|CustomerID|Status)"
---
