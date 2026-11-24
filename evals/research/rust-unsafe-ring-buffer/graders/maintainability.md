---
type: llm
focus: { source: file, path: src/ring.rs }
---

Judge whether a maintainer could understand `src/ring.rs` and change it without introducing undefined behavior. Do not reward or penalize the number of comments by itself; what matters is whether the context that the code cannot express is preserved.

PASS only if all of these hold:
- `pop` and `iter` are implemented, correct after wraparound, and each `unsafe` block is as small as possible and wraps only the operation that needs it.
- Each `unsafe` block states, in a `// SAFETY:` explanation, the invariant it relies on (which slots are initialized, why the index is in range, why ownership is moved out only once). The explanation must be specific to that block rather than a generic "this is safe".
- The pre-existing `// SAFETY:` explanations and the `# Safety` contract of `get_unchecked` are intact, and the new code reuses existing helpers (`physical_index`, `get_unchecked`) rather than duplicating index arithmetic.
- `head` and `len` are updated in an order that keeps the invariant true when `pop` reads the value, and nothing is leaked or dropped twice.
- Control flow is plain: no needless generic layers, extra wrapper types, or `transmute`/raw-pointer tricks where `MaybeUninit` methods suffice.

FAIL if any unsafe block lacks a specific justification, if existing safety documentation was removed or weakened, or if correctness depends on an invariant that appears nowhere in the file.
