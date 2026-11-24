---
type: llm
focus: { source: file, path: src/local-days.ts }
---

You are reviewing time-zone aware date bucketing code that uses only `Intl`. Judge whether a maintainer could understand it and safely change it, for example when a bug is reported for a zone with an unusual offset. Do not reward or penalize the number of comments by itself; judge whether the code and any comments present make the behaviour clear.

PASS only if all of these hold:

- The approach to finding a local midnight across DST is understandable from the code: a reader can tell what the offset computation represents and why there is a correction step or second pass, either from naming and structure or from a brief explanation of the non-obvious part. A bare unexplained "calculate twice" fails.
- Date arithmetic that is easy to get wrong (month rollover, UTC versus local, zero-padding, seconds truncation) is done in one place each rather than ad hoc at several call sites.
- The functions compose: `bucketByLocalDay` is built from `localDateKey` (or the same primitive) rather than re-deriving date logic, so the three exports cannot disagree.
- Names make the instant versus wall-clock distinction clear (instant, wall clock, offset, local midnight).
- No needless indirection: no date library emulation, no caching layers, no classes where functions suffice.
- Comments, if any, explain something the code cannot say; they do not restate the line beneath them.

FAIL if any of the above is clearly violated, for example if a maintainer could not tell why the offset is computed twice, or the same date-formatting logic is duplicated in several functions.
