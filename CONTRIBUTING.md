# Contributing

Thanks for helping. The project's own rule applies to its code: make the code explain itself. Comments are welcome where
they carry information the code cannot (see the skill), and the hook runs on this repository too.

## Setup

```bash
git clone https://github.com/aaronrosenthal/claude-code-readability
cd claude-code-readability
npm install          # dev tooling only (Biome); the plugin itself has no dependencies
npm test             # unit + integration tests
npm run lint         # Biome lint and format check
npm run bench        # performance benchmark
claude plugin validate .
```

Node.js 20 or newer is required. To try your working copy in Claude Code: `claude --plugin-dir .`.

## Adding or improving a language

1. **Lexer profile** (`src/lexer/profiles.mjs`): describe comment and string syntax. The lexer must never mistake string
   contents for comments; when a construct cannot be tokenized with confidence, throw `UnreliableParse` so the hook
   fails open instead of guessing.
2. **Register the language** in `src/lexer/languages.mjs` with its extensions, file names, and support tier.
3. **Directives** (`src/directives/registry.mjs`): add the tool's machine-read comments. Link the official docs in `url`,
   follow the documented grammar exactly (spacing, separators, justification syntax), and return `suppression(...)` for
   anything that silences a diagnostic so it goes through the suppression policy. Documentation rules belong in
   `src/directives/documentation-rules.mjs`.
4. **Declarations** (`src/classify/declarations.mjs`), if documentation policy should understand the language.
5. **Discovery** (`src/discovery/resolvers.mjs`), if the language has linters that require documentation. Read files,
   never execute them, and return `unresolved(...)` when you cannot be sure.
6. **Tests**: lexer cases in `tests/unit/lexer.test.mjs`, positive and negative directive fixtures in
   `tests/unit/directives.test.mjs` (including near-misses that must *not* be treated as directives), classification
   cases in `tests/unit/classify.test.mjs`.
7. Regenerate the docs: `node scripts/dev/generate-docs.mjs` (CI fails if `docs/directives.md` is stale).

## Adding an eval case

Follow [`evals/CASES.md`](evals/CASES.md). Every case needs a reference solution, and
`node evals/tools/validate-fixtures.mjs <case>` must pass (CI runs it for every case with all toolchains installed).
Keep prompts realistic and never mention comments, readability, or the plugin unless a real developer would.

## Pull requests

- Keep changes focused, with tests. CI runs tests on Linux, macOS, and Windows, lint, plugin validation, fixture
  validation, and a performance budget check. No CI job makes paid model calls except the manually triggered eval workflow.
- Do not commit eval results or transcripts (`evals/results/` is ignored), credentials, or unrelated files.
- Update `CHANGELOG.md` under an "Unreleased" heading.
