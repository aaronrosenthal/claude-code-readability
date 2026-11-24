---
description: Implement a slug generator utility with transliteration, length limits, and reserved slugs.
tags: [smoke, typescript, string-utilities]
runs: 3
max_turns: 25
timeout_seconds: 400
allowed_tools: [Read, Glob, Grep, Skill]
---

`src/slugify.ts` has a stub for `slugify(title, options)`. We use it for post URLs in the CMS. Please implement it so the tests in `test/slugify.test.ts` pass:

- Lowercase ASCII output, with runs of anything that isn't a letter or digit collapsed into a single hyphen and no leading or trailing hyphens.
- Common accented characters are transliterated (`é` becomes `e`, `ß` becomes `ss`, `Æ` becomes `ae`, `ł` becomes `l`, and so on).
- `maxLength` defaults to 60. When the slug is longer, cut it at the last whole word that fits. A single word longer than `maxLength` is cut at `maxLength`.
- Slugs that match an entry in `reserved` (defaults to `admin`, `api`, `new`, `edit`, `login`) get `-post` appended.
- If nothing is left after cleaning, return `untitled`.

When you're done, run `node --test` and save its complete output to `test-results.txt`.
