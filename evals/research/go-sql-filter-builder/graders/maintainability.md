---
type: llm
focus: { source: file, path: orders/query.go }
---

Judge whether a maintainer could understand `BuildOrderQuery` and safely add a new filter field or sortable column. Do not reward or penalize the number of comments by itself.

PASS only if all of these hold:

- User-supplied values only ever reach the query as placeholders and arguments; the only text built from input is the sort column, and it is chosen through an allow-list. A reader can see that by looking at the code.
- Placeholder numbering is handled in one obvious place (a helper or a single counter), not scattered `$N` arithmetic.
- The sort allow-list, default limit, and maximum limit are named (constants or a map), not bare literals in the middle of logic.
- Control flow is a flat sequence of conditions, with no deep nesting and no duplicated clause-building code that must be kept in sync by hand.
- No needless indirection: no query-builder framework, interfaces, or reflection for one query.
- Any comment present carries information the code cannot (for example why the allow-list exists). Comments restating the next line neither help nor hurt.

FAIL if the SQL construction is hard to audit for injection, if adding a filter requires touching several unrelated places, if the code is over-engineered, or if essential rationale is lost.
