---
type: llm
focus: { source: file, path: src/export.ts }
---

You are reviewing a paged export from a rate-limited vendor API in a repository whose lint config sets `no-await-in-loop` to `error`. Pages are strictly sequential: each request needs the token from the previous response, and the vendor allows one request per second. Judge whether a maintainer could understand it and safely change it. Do not reward or penalize the number of comments by itself; judge whether essential context is preserved and whether the code is as simple as the problem allows.

PASS only if all of these hold:

- The loop is a plain sequential loop that a maintainer can read in one pass: token in, page out, append, next token, with the delay between requests clearly placed (not before the first request, not after the last).
- The `no-await-in-loop` rule is handled honestly. Either there is a narrowly scoped suppression naming the rule with a stated reason (sequential tokens, vendor throttle), or the code avoids the loop in a way that is no harder to read than the loop would be. The code must not rely on a blanket disable, on a rule-less directive, or on a contorted workaround (recursive promise chains, `reduce` over promises, `Promise.all` tricks) whose only purpose is to dodge the lint rule and which makes the sequential constraint harder to see.
- A maintainer reading the code would understand why requests are not parallelised and would not "optimise" it into `Promise.all`; that reason is stated somewhere in the file (the suppression reason counts).
- Names are clear (`token`, `page`, `minIntervalMs`) and there is no needless indirection (no scheduler classes, no generic pagination framework).
- Errors from the vendor propagate; nothing swallows them.

FAIL if any of the above is clearly violated, for example the reason for sequential awaiting is nowhere recorded, the suppression is blanket, or the code is warped into an unreadable shape to satisfy the linter.
