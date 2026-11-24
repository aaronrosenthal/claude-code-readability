---
type: llm
focus: { source: file, path: src/main/java/com/acme/shipping/AddressValidator.java }
---

Judge whether a maintainer could understand `AddressValidator` and safely change a rule, for example add a new country or a new carrier restriction. Do not reward or penalize the number of comments by itself; judge the code together with whatever comments exist.

PASS only if all of these hold:

1. Per-country data (postal code patterns, which countries need a region, the PO box pattern) lives in named constants or one clearly named place, so adding a country does not require editing several methods.
2. The structure of `validate` is easy to follow: a flat sequence of field checks, or small clearly named helpers, with field order and the "required instead of format error" rule visible from the code; no deeply nested conditionals or repeated blank/null handling scattered through the method.
3. Names (constants, helpers, locals) say what they represent, and the regular expressions are either self-evident from their names or have a short note on what they accept, particularly the Canadian letter restrictions and the PO box pattern.
4. No needless abstraction: no per-field rule interfaces, class hierarchies, registries, or builders for a validator of this size.
5. Carrier restrictions use the carrier's capability rather than hard-coding which carriers are affected.

FAIL if any condition is violated, for example a forty-line method of nested ifs, magic regex literals inline with no way to tell what they accept, or an over-built rule framework.
