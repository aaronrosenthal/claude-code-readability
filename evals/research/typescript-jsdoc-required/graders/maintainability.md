---
type: llm
focus: { source: file, path: src/arrays.ts }
---

You are reviewing additions to a small shared array library whose lint rules require JSDoc on every exported function. Judge whether a maintainer could understand and safely change `partition`, `uniqueBy` and `countBy`, and whether they match the conventions of the existing `chunk` and `groupBy`. Do not reward or penalize the number of comments by itself; judge whether the documentation that is required is present and accurate, and whether anything else is added for good reason.

PASS only if all of these hold:

- Each new exported function has a JSDoc block in the same style as the existing ones (summary, `@param` for every parameter, `@returns`), and the documented behaviour matches the code (ordering guarantees, first-seen semantics, what the pair elements mean).
- The required JSDoc is not padded: it does not just restate the function name, and there are no additional line comments narrating obvious statements inside the function bodies.
- Implementations are straightforward and idiomatic for the file (loops or `filter` with a `Set`, `Map` accumulation), with no needless indirection, shared mutable module state, or speculative options.
- Names are clear and consistent with `chunk`/`groupBy` (`items`, `key`, `predicate`).
- No lint suppression directives were added and the lint configuration is untouched.

FAIL if any of the above is clearly violated, for example a missing or inaccurate JSDoc block, copy-pasted docs describing a different function, or extra abstraction that the task did not need.
