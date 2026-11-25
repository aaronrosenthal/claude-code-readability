# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-11-25

### Changed

- **The default mode is now `advisory`.** It classifies comments like `balanced`, but only tells Claude which comments
  and suppressions look unnecessary. It never blocks a comment.
  - **Why:** in the 0.1.x research eval, about two thirds of the comments the blocking hook rejected were judged
    necessary.
  - **Still enforced:** edits to the readability configuration and edits that weaken a linter's documentation rules
    ask for confirmation in every mode except `off`.
  - **To keep blocking:** set `"mode": "balanced"` or `"mode": "strict"`.
- **Advisory mode now checks suppressions too.** It reports documentation-rule suppressions and unjustified
  suppressions (`suppressions.new` `auto` resolves to `justify`) instead of skipping them.
- **The advisory note tells Claude to keep comments that give context.** That covers any comment recording a reason,
  rule, precondition, or external fact.
- **The `readable-code` skill asks for comments that explain why.** It targets comments that say *what* the code does,
  not every explanatory comment. It now lists the comments to keep:
  - the rule behind a value that looks arbitrary;
  - the reason for a guard that looks removable;
  - surprising library behavior;
  - preconditions of private helpers.

  With comments visible, the blinded judge's preference for the plugin's code rose from 37% to 56%.
- **The hook script accepts `--mode=<mode>`.** Eval arm C uses it to keep measuring the blocking hook.

## [0.1.1] - 2026-11-24

### Fixed

- Python docstrings after a `def` or `class` header that spans several lines were treated as bare strings used as
  comments and rejected, even where Ruff or Pylint required them.
- C# and Java constructors were read as private (C#) or package-private (Java) because `public` was parsed as a
  return type, so documentation that CS1591 or Checkstyle required on public constructors was rejected.
- Both bugs were found by the research eval: replaying every rejected edit through the fixed hook, 18 of 46 rejections
  (39%) were of this kind, and they caused all four correctness failures in the hook-only arm.

### Evaluation tooling

- `analyze.mjs` and `gate.mjs` exclude runs that ended in an API or usage-limit error instead of counting them as
  incorrect, and the report warns about cases that fail in every arm (usually a broken environment).
- Generated lockfiles (`Cargo.lock`, `package-lock.json`, ...) no longer count as unrelated churn.
- `go-webhook-client-retry` tests use an in-memory `http.RoundTripper`; the eval sandbox does not allow binding sockets.
- Documented that the eval sandbox only lets runs read toolchains whose root directory is on `PATH`.
- Tests run through `scripts/dev/test.mjs`, which works on Node 20 to 26 and Windows.

## [0.1.0] - 2026-11-24

### Added

- `readable-code` skill: principles for code that explains itself, when comments belong, how to respond to rejections.
- Deterministic `PreToolUse` hook for `Write`, `Edit`, `NotebookEdit`, and literal-path `cat`/`tee` heredocs in `Bash`.
  It analyzes only newly introduced comments and rejects unnecessary ones with file, line, comment, and reason.
- Language-aware lexer for 31 languages in three support tiers, including JSX, template literals, raw strings, heredocs,
  nested comments, and embedded `<script>`/`<style>` in HTML, Vue, and Svelte. Unreliable input fails open.
- Directive registry covering 41 tool families with grammars checked against each tool's documentation, separate from a
  suppression policy (justification, scope, blanket and file-wide rules, allow and deny lists, broadening detection).
- Documentation-requirement discovery for RuboCop, ESLint (jsdoc), Ruff, Pylint, pydocstyle, Checkstyle, SwiftLint,
  .NET (CS1591, StyleCop), Dart, Rust, and revive, without executing configuration.
- Protection against circumvention: documentation-rule suppressions, linter-config weakening, readability-config edits.
- Modes `strict`, `balanced`, `advisory`, `off`; per-language overrides; JSON Schema for configuration.
- Unit and integration tests, benchmarks, native `claude plugin eval` smoke and research suites, arm builder,
  deterministic metrics, blinded pairwise judging, and CI workflows.
