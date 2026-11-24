---
type: regex
target: { source: file, path: src/main/java/com/acme/inventory/ReorderPlanner.java }
pattern: '/\*\*(?:(?!\*/)[\s\S])*@param\s+\w+(?:(?!\*/)[\s\S])*@return\b(?:(?!\*/)[\s\S])*\*/\s*public\s+List<ReorderSuggestion>\s+suggest\('
---
