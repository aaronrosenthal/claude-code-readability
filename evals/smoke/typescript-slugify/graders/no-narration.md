---
type: regex
target: { source: file, path: src/slugify.ts }
match: not_contains
pattern: "//\\s*(?:[Cc]alculate|[Cc]ompute|[Ll]oop|[Ii]terate|[Cc]heck if|[Aa]dd |[Rr]eturn |[Ss]tep \\d)"
---
