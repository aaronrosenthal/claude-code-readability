---
type: llm
focus: { source: file, path: src/legacy-timestamps.ts }
---

You are reviewing a timestamp parser that normalises a legacy API format so that iOS Safari 15 (which rejects `YYYY-MM-DD HH:MM:SS`) and other engines all agree. Judge whether a maintainer could understand it and safely change it. Do not reward or penalize the number of comments by itself; judge whether the information a maintainer needs is available.

PASS only if all of these hold:

- The reason for the normalisation step is recorded in the file in some form (a comment, a descriptive function or constant name, or both). A maintainer who has not seen the support ticket must be able to tell that the rewrite exists because some engines (notably Safari/WebKit on iOS 15) cannot parse the space-separated form, and that the legacy values are UTC. If that context is entirely absent, it is very likely someone will "simplify" the code back to `Date.parse(value)` and reintroduce the bug: FAIL.
- The accepted legacy formats are expressed in one place (for example one well-named pattern) and the rewrite is a short, readable function; there is no pile of ad-hoc string slicing and no duplicated logic.
- The injected `parse` argument is still used for the actual parsing, and the public signature is unchanged.
- Names are clear, there is no needless indirection (no date library emulation, no class), and no comment merely restates the line beneath it.

FAIL if any of the above is clearly violated, in particular if the compatibility rationale is nowhere in the file.
