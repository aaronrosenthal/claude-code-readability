# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

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
