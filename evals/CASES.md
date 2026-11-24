# Writing eval cases

Every case is a directory under `evals/smoke/` or `evals/research/` in the layout that
[`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals) reads, plus two files that only this repository's
tooling reads (`analysis.json` and `reference/`). The agent under test never sees the eval directory, so neither of
those leaks into a run.

```text
evals/research/<case-id>/
├── prompt.md          # frontmatter + the realistic user request
├── case.yaml          # schema_version "1.1", name, context.scaffold_script
├── scaffold.sh        # writes the fixture project into the empty workspace
├── analysis.json      # metadata for validate-fixtures.mjs and the analysis scripts
├── reference/         # a correct solution, copied over the scaffold for validation only
└── graders/
    ├── tests-pass.md      # regex over test-results.txt (weight 3): correctness is a hard gate
    ├── tests-ran.md       # tool_used Bash, input_match naming the test command
    ├── tests-untouched.md # regex over the test file: a key assertion still exists
    ├── <case-specific>.md # preserved directives, required docs, no new suppressions, ...
    └── maintainability.md # research cases only: llm judge on the unmodified implementation
```

## prompt.md

```markdown
---
description: One sentence for humans.
tags: [research, python, financial-calculations]
runs: 3
max_turns: 40
timeout_seconds: 600
allowed_tools: [Read, Glob, Grep, Skill]
---

<A request phrased the way a developer would type it.>

When you're done, run `<test command>` and save its complete output to `test-results.txt`.
```

Rules:

- **Realistic prompts.** Describe the task, not the experiment. Never mention comments, readability, the plugin, hooks,
  or linters unless a real developer would (for example "CI fails Style/Documentation on these classes").
- **The last paragraph is always the test instruction above**, worded exactly that way, so every case and arm measures
  correctness the same way.
- `Write`, `Edit`, `NotebookEdit` and `Bash` are granted by the runner (`--allow-tools`), identically for every arm.
- Tags: `research` or `smoke`, the language id, and one tag per scenario from the list in `evals/README.md`, kebab-case.

## scaffold.sh

- `#!/usr/bin/env bash` and `set -euo pipefail`; write files with quoted heredocs (`<<'EOF'`).
- Finish with `git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture`
  so the analysis can diff the final workspace against the fixture.
- No network, no package installs. Standard library test frameworks only:
  - Python: `unittest`, compatible with Python 3.9+ (no `match`, no `X | Y` annotations at runtime).
  - TypeScript: Node's built-in runner, `node --test`. Node runs `.ts` files natively by stripping types, so include a
    `tsconfig.json` with `"erasableSyntaxOnly": true` and `"module": "nodenext"`, and import with `.ts` extensions.
    No `enum`, `namespace`, or constructor parameter properties.
  - Ruby: `minitest` from the standard library, compatible with Ruby 2.6+.
  - Go: `go test ./...`, standard library only, `go.mod` with `go 1.21`.
  - Rust: `cargo test`, no dependencies, edition 2021.
  - Java: no build tool. Tests are a `TestRunner.java` with a `main` that prints `ALL <n> TESTS PASSED` and exits
    non-zero on failure, run as `javac -d out $(find src -name '*.java') && java -cp out TestRunner`.
  - C#: a console project (`net8.0`, no package references) whose `Program.cs` runs assertions and prints
    `ALL <n> TESTS PASSED`, run as `dotnet run --project Tests`.
- A fixture is a small but plausible project: real domain names, a few files, existing code style that the change must
  fit into. Seed realistic pre-existing comments, directives, and docs where the scenario calls for them.

## analysis.json

```json
{
  "language": "python",
  "toolchain": "python3",
  "scenarios": ["financial calculations"],
  "targets": ["billing/proration.py"],
  "tests": ["tests/test_proration.py"],
  "testCommand": "python3 -m unittest discover -s tests -v",
  "initialTestsPass": false,
  "preserve": ["# type: ignore[import-untyped]"],
  "notes": "What a good solution looks like and what would count as circumvention."
}
```

`toolchain` is one of `python3`, `node`, `ruby`, `go`, `cargo`, `java`, `dotnet`. `targets` are the files the task is
expected to change; changes elsewhere count as unrelated churn. `preserve` lists exact strings that must survive.
Set `initialTestsPass: true` only for cases where the tests already pass (refactors, documentation tasks); the
validator otherwise requires that the tests fail before the change.

## Graders

All deterministic graders must pass on `reference/`; `node evals/tools/validate-fixtures.mjs` checks this.

```markdown
---
type: regex
weight: 3
target: { source: file, path: test-results.txt }
pattern: "Ran 6 tests[\\s\\S]*\\nOK\\s*$"
---
```

Expected test output patterns (pin the test count so deleting tests fails the grader):

| Toolchain | `tests-pass` pattern |
| :- | :- |
| python3 | `Ran N tests[\s\S]*\nOK\s*$` |
| node | `ℹ pass N\s*\nℹ fail 0` |
| ruby | `N runs, \d+ assertions, 0 failures, 0 errors` |
| go | `^(?![\s\S]*\bFAIL\b)[\s\S]*(^\|\n)ok\s` (no count available without `-v`; rely on `tests-untouched`) |
| cargo | `test result: ok\. N passed; 0 failed` |
| java / dotnet | `ALL N TESTS PASSED` |

`tests-ran` is `type: tool_used`, `tool: Bash`, with an `input_match` regex that matches the JSON-encoded test command.

Case-specific graders check structure that a deterministic regex can decide, for example:

- a pre-existing directive or necessary comment is still present (`preserve-*`)
- required documentation exists (`docs-*`)
- no new suppression of a documentation rule and no linter config edits (`no-circumvention-*`, `match: not_contains`)

Do not grade on comment counts in the native graders: comment density is measured by the analysis scripts, separately
from correctness, so that fewer comments can never compensate for wrong code.

`maintainability.md` (research only) is an `llm` grader focused on the main target file, with concrete PASS/FAIL
conditions about whether a maintainer would understand and safely change the code, including whether context that the
code cannot express (constraints, workarounds, required docs) is preserved. It must not reward or penalize comment count
by itself.
