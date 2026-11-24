---
type: regex
target: { source: file, path: src/config.rs }
pattern: "(?=[\\s\\S]*MissingSeparator \\{ line: usize \\})(?=[\\s\\S]*UnknownKey \\{ line: usize, key: String \\})(?=[\\s\\S]*DuplicateKey \\{ line: usize, key: String \\})(?=[\\s\\S]*InvalidValue \\{ line: usize, key: String, value: String \\})(?=[\\s\\S]*MissingKey \\{ key: &'static str \\})"
---
