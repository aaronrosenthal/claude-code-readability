---
type: regex
target: { source: file, path: build.sh }
match: not_contains
pattern: '-Xlint:-|-Xlint:none|-nowarn|-XDignore|-Xlint:all,-'
---
