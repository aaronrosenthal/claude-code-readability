---
type: regex
target: { source: file, path: tests/ring.rs }
pattern: "assert_eq!\\(Rc::strong_count\\(&tracker\\), 1\\);"
---
