---
type: regex
target: { source: file, path: src/config.rs }
match: not_contains
pattern: "todo!\\(|unimplemented!\\(|\\.unwrap\\(\\)|\\.expect\\("
---
