---
type: regex
target: { source: file, path: src/main/java/com/acme/inventory/ReorderPlanner.java }
match: not_contains
pattern: 'CHECKSTYLE[:.]OFF|@SuppressWarnings\(\s*(?:\{\s*)?"checkstyle|NOPMD|@SuppressWarnings\(\s*"all"'
---
