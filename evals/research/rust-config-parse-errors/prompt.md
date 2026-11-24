---
description: Parse an INI-like service config into a typed struct with a precise error enum, Display and std::error::Error.
tags: [research, rust, error-handling]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

`relayd` needs to read its settings from a small `key = value` file. `src/config.rs` already has `ServiceConfig`, `LogLevel` and the `ConfigError` variants we agreed on, but `parse` is a `todo!()` and the error type has no `Display` or `Error` impl yet. Please finish it so the tests in `tests/config.rs` pass:

- Blank lines and lines starting with `#` are skipped; whitespace around keys and values is ignored.
- Keys: `host` (required, non-empty), `port` (required, 1-65535), `workers` (default 4, must be at least 1), `log_level` (`error|warn|info|debug`, default `info`), `tls` (`true|false`, default `false`).
- Errors carry 1-based line numbers counted over the whole file, including skipped lines. A duplicate key is reported at its second occurrence.
- `ConfigError` should implement `Display` with messages an operator can act on (the tests pin the wording) and `std::error::Error`.

When you're done, run `cargo test` and save its complete output to `test-results.txt`.
