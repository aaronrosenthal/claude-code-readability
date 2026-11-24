# Evaluation suite

Cases for [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals), plus tooling that runs the four arms,
analyzes the transcripts, and runs blinded judging. The methodology is in [docs/evaluation.md](../docs/evaluation.md).
The rules for writing cases are in [CASES.md](CASES.md).

```text
evals/
├── smoke/      4 cheap cases (about $2.50 for all four arms, 2 runs each, Sonnet)
├── research/   45 cases across Python, TypeScript, Go, Rust, Java, C#, and Ruby
└── tools/      validate-fixtures, build-variants, run-arms, analyze, blind-judge, gate
```

Results go to `evals/results/` and arm variants go to `.eval-variants/`. Git ignores both, because transcripts and
workspaces are not published.

## Scenario map

| Scenario | Cases |
| :- | :- |
| Complex filtering and transformation | `python-transaction-filtering`, `python-notebook-cleaning` |
| Financial calculations | `python-transaction-filtering`, `typescript-invoice-proration`, `csharp-loyalty-points`, `smoke/python-shipping-cost` |
| Nested conditionals | `go-rate-limit-tiers`, `csharp-loyalty-points` |
| State machines | `typescript-order-state-machine`, `java-subscription-state-machine` |
| Validation logic | `python-signup-validation`, `java-validation-rules` |
| Error handling | `typescript-fetch-retry-errors`, `rust-config-parse-errors`, `csharp-async-retry-orchestration` |
| Async orchestration | `python-async-fanout`, `typescript-parallel-image-jobs`, `csharp-async-retry-orchestration` |
| Database queries | `python-sqlite-cohort-report`, `go-sql-filter-builder` |
| Domain modeling | `rust-money-domain` |
| Date and time calculations | `python-business-days`, `typescript-dst-date-ranges` |
| API integrations | `typescript-paginated-api-client`, `go-webhook-client-retry` |
| Legacy code modification | `python-legacy-discount-rules`, `typescript-legacy-pricing-refactor` |
| Bug fixes in unfamiliar code | `java-csv-parser-bugfix`, `ruby-bugfix-unfamiliar` |
| Concurrency-sensitive code | `python-threadpool-counter`, `go-ttl-cache-concurrency` |
| Public API implementation | `typescript-jsdoc-required`, `csharp-xml-docs-required`, `java-javadoc-checkstyle` |
| Code that genuinely requires a linter suppression | `typescript-legit-eslint-suppression`, `java-required-deprecation-suppression`, `csharp-obsolete-api-suppression` |
| Code that genuinely requires a compatibility explanation | `typescript-safari-date-compat` |
| Code containing pre-existing comments or suppressions | `python-legacy-discount-rules`, `ruby-bugfix-unfamiliar`, `rust-unsafe-ring-buffer`, `typescript-existing-suppressions` |
| Unnecessary abstraction would hurt readability | `python-minimal-change` |
| Already readable, should barely change | `go-already-readable`, `csharp-already-readable-change` |
| Linter-required documentation | `python-module-docstrings-ruff`, `ruby-style-documentation`, `ruby-inherited-rubocop`, `smoke/ruby-style-documentation-smoke` |
| Circumventing documentation linters | `ruby-rubocop-config-circumvention`, `smoke/python-docstring-circumvention-smoke` |
| Conflicting or unresolved configuration | `python-conflicting-policies`, `python-unresolved-ruff-extend` |

## Running

```bash
# Free: scaffold every case, check that tests fail, apply the reference, and check that tests and graders pass
node evals/tools/validate-fixtures.mjs
node evals/tools/validate-fixtures.mjs --require-toolchains    # fail instead of skipping a missing toolchain

# Paid: all four arms
node evals/tools/run-arms.mjs --tag smoke --runs 2 --budget 12
node evals/tools/analyze.mjs evals/results/arms/<timestamp>
node evals/tools/blind-judge.mjs evals/results/arms/<timestamp> --pairs A:D,B:D,C:D --audit-comments --budget 3
node evals/tools/analyze.mjs evals/results/arms/<timestamp>
node evals/tools/gate.mjs evals/results/arms/<timestamp> --max-correctness-drop 5
```

`run-arms.mjs` splits `--budget` (USD, list price) across the arms and passes each share to `claude plugin eval --budget`, which enforces it. `--case <id>` runs a single case and
`--arms A,D` runs a subset of arms. Arm A always comes from the native `--ablation with-without` baseline of the D run.

## Results

- [Research suite, 2026-11-24](../docs/results/research-2026-11-24.md): 360 runs, v0.1.0 hook.
- [Smoke suite, 2026-11-24](../docs/results/smoke-2026-11-24.md): a pilot with 32 runs.
