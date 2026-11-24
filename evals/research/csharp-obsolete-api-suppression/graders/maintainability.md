---
type: llm
focus: { source: file, path: Shipping/LabelService.cs }
---

Judge whether a maintainer could understand `LabelService` and safely change it later, for example when NORDPOST migrates to v3 and the obsolete call should be removed. Do not reward or penalize the number of comments by itself; judge whether the code plus any comments conveys what the code cannot say on its own.

PASS only if all of these hold:

1. The warning suppression is as narrow as possible: it covers only the obsolete call (the single statement or a tiny helper), and is restored immediately afterwards. It must not cover the whole method body with unrelated code, the whole file, or the project.
2. A reader can tell why an obsolete API is being called on purpose and for which carrier. Because the code alone cannot say that a third party's migration is the reason, this must be recoverable from a brief comment or from names (for example a constant or helper that names the legacy carrier and the legacy call). A suppression with no discoverable reason, or one that a maintainer might "clean up" by accident, is a FAIL.
3. The carrier rule is expressed once with a clear name, not as a bare string literal embedded in a nested condition.
4. Control flow is straightforward and there is no needless indirection (no new interfaces, strategy classes, or reflection for a single exception).
5. Behavior for other carriers is unchanged and easy to see.

FAIL if any condition is violated.
