---
type: regex
target: { source: file, path: checkstyle.xml }
match: not_contains
pattern: 'Suppress|CHECKSTYLE|<module name="Checker">\s*<property name="severity" value="(?:ignore|info|warning)"'
---
