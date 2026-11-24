---
type: regex
target: { source: file, path: src/ring.rs }
pattern: "(?=[\\s\\S]*// SAFETY: the buffer is not empty, so offset 0 is below `len`\\.)(?=[\\s\\S]*// SAFETY: the caller guarantees `offset < len`\\. The `len` slots starting\\n\\s*// at `head` \\(wrapping around the end\\) are always initialized, because\\n\\s*// `push` writes a slot before growing `len`\\.)(?=[\\s\\S]*// SAFETY: `offset < len`, so this slot is initialized, and each slot\\n\\s*// is visited once, so nothing is dropped twice\\.)"
---
