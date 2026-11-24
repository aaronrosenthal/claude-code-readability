# Evaluation methodology

The central question:

> Does restricting unnecessary comments improve the intrinsic readability of AI-generated code without sacrificing
> correctness or introducing unnecessary complexity?

The suite is designed so that the answer can be **no**. The hook could simply make Claude delete comments, push it into
gratuitous helper functions, make it slower and more expensive, or break correctness. Each of those outcomes is
measured.

## Arms

| Arm | Condition | How it is produced |
| :- | :- | :- |
| A | Claude Code without the plugin | the native no-plugin baseline (`--ablation with-without`) of the D run |
| B | Skill only, no enforcement | plugin variant with `skills/` only |
| C | Hook with minimal feedback, no skill | plugin variant with the hook in `balanced` (blocking) mode and `--feedback=minimal` (locations only, no reasons or guidance) |
| D | Full plugin | plugin variant with skill, hook, and actionable feedback, in the default mode (`balanced` up to 0.1.1, `advisory` from 0.2.0) |

`evals/tools/build-variants.mjs` builds B, C, and D from the same files with the same manifest, so they differ only in
the treatment. All arms use the same cases, scaffolds, tool grants (`Write Edit NotebookEdit Bash`, OS-sandboxed),
turn and time limits, model (pinned with `--model`), and judge model. Runs are isolated by `claude plugin eval`: no user
settings, `CLAUDE.md`, memory, or other plugins load.

The primary comparison (D vs A) is the framework's own `Δ`. B and C isolate the contribution of instructions alone and
of enforcement alone.

## Cases

Cases live in `evals/smoke/` (4 cheap cases) and `evals/research/` (45 cases across Python, TypeScript, Go, Rust,
Java, C#, and Ruby). See [`evals/README.md`](../evals/README.md) for the scenario map and
[`evals/CASES.md`](../evals/CASES.md) for authoring rules. Prompts are realistic requests; none mentions comments or
the plugin unless a real developer would (for example a CI log that complains about missing documentation).

Every case ships a reference solution. CI scaffolds every case, checks that its tests fail before the change, applies
the reference, and checks that its tests and every deterministic grader pass. This catches broken fixtures and graders
without any model calls.

## Metrics

Correctness is a hard gate. It is never traded against readability: pairwise readability comparisons are only made
between two correct implementations, and when exactly one is correct it wins on correctness without being judged.

| # | Metric | How it is measured |
| :- | :- | :- |
| 1 | Functional correctness | the case's tests, run by Claude and saved to `test-results.txt`; pinned test counts; a grader that the test file still contains a key assertion; `tool_used` proof the command ran |
| 2 | Intrinsic readability | blinded pairwise judge on comment-normalized code |
| 3 | Identifier quality | blinded pairwise judge; deterministic proxy: share of cryptic identifiers in target files |
| 4 | Control flow clarity | blinded pairwise judge |
| 5 | Cognitive complexity | deterministic approximation (control structures weighted by nesting, plus boolean sequences), comments removed |
| 6 | Appropriate abstraction | blinded pairwise judge; function and type counts; revision labels that flag single-use helpers |
| 7 | Unnecessary comment density | new non-directive comment lines per 100 changed target lines (lexer, classifier-independent); separately, new comments the classifier would reject (circular for C and D, reported for transparency) |
| 8 | Preservation of necessary comments | `preserve-*` graders and `analysis.json` `preserve` strings; maintainability judge on the unmodified code |
| 9 | Unrelated code churn | changed lines outside the case's target and test files; "unchanged function" graders |
| 10 | Hook false positives | comment audit: rejected comments that a blinded judge labels necessary |
| 11 | Hook false negatives | comment audit: comments surviving in C/D that the judge labels unnecessary |
| 12 | Token consumption | `usage` in the run transcript (input including cache reads and writes, plus output) |
| 13 | Wall-clock time | per-run duration from the eval result |
| 14 | Rejected edits and retries | hook rejections in the transcript; rejected edits followed by a revised edit |
| 15 | Estimated cost | list-price cost from the eval result |

Two more signals guard against gaming: structural graders that fail on new documentation-rule suppressions, linter or
readability config edits, and blanket suppressions; and a count of source files written through the shell after a hook
rejection (a possible bypass).

## Avoiding bias

- **Comment normalization.** For the intrinsic-readability comparison, all comments and Python docstrings are removed
  from both candidates using the plugin's lexer, except machine-read directives (`# type: ignore[...]`, `//go:build`,
  `eslint-disable-next-line ... -- reason`, ...). A judge therefore cannot prefer code for having fewer comments.
- **Original code judged separately.** A second pairwise question shows both implementations exactly as written and
  asks about overall maintainability and preservation of important context. Each research case also has a native
  `llm` maintainability grader on the unmodified file, whose rubric forbids rewarding comment count by itself.
- **Blinding.** Judges see "Candidate 1" and "Candidate 2" and the task prompt only. No arm names, hook messages, or
  plugin identity. Judge sessions run with no setting sources, no tools, no skills, no MCP servers, in an empty
  directory, with a fixed reviewer system prompt.
- **Order randomization and position-bias control.** Presentation order is randomized with a recorded seed, and every
  comparison is judged a second time with the order swapped. When the two verdicts disagree the comparison is reported
  as "inconsistent" and excluded from win rates.
- **Repetition and uncertainty.** Each case runs several times per arm. Reports give 95% bootstrap intervals over runs
  (Wilson intervals for rates) and paired per-case differences against A with bootstrap intervals over cases. These
  describe variation within this suite and model; they are not significance tests and do not generalize to all tasks.
- **Correctness first.** See above.

## Does the hook cause structural improvement or just deletion?

For every hook rejection in arms C and D, the analysis pairs the rejected proposal with the next accepted edit to the
same file and labels the revision with deterministic heuristics:

| Label | Heuristic |
| :- | :- |
| comment deletion only | code identical after removing comments and normalizing whitespace |
| identifier improvement | identifiers renamed (some removed, some added) |
| control flow improvement | the number of control structures or early exits changed |
| function decomposition | new functions introduced |
| type or domain modeling improvement | new types, classes, enums, records, or structs |
| unnecessary abstraction | two or more new functions that are each used once, without the code getting shorter |
| other changes | anything else |

A high share of "comment deletion only" would support the null hypothesis that the hook merely deletes comments. The
labels are heuristics and are reported as such; the blinded judge provides the independent readability signal.

## Reproducing

```bash
npm install
node evals/tools/validate-fixtures.mjs                     # deterministic: fixtures, references, graders

# Smoke suite, all arms, 2 runs each, about $5-10 at Sonnet list prices
node evals/tools/run-arms.mjs --tag smoke --runs 2 --budget 12
node evals/tools/analyze.mjs evals/results/arms/<timestamp>
node evals/tools/blind-judge.mjs evals/results/arms/<timestamp> --pairs A:D,B:D,C:D --audit-comments --budget 3
node evals/tools/analyze.mjs evals/results/arms/<timestamp>   # folds the judgments into report.md

# Full research suite (45 cases x 4 arms x 3 runs = 540 agent runs); budget accordingly
node evals/tools/run-arms.mjs --tag research --runs 3 --budget 300 --concurrency 4

# Native framework directly, primary comparison only
claude plugin eval . --scaffold --trust-plugin --allow-tools Write Edit NotebookEdit Bash --model claude-sonnet-5-5
```

Shell grants run under Claude Code's OS sandbox (macOS: built in; Linux: install `bubblewrap` and `socat`; Windows:
use WSL2). The case toolchains (`python3`, `node`, `ruby` with minitest, `go`, `cargo`, `javac`/`java`, `dotnet`) must be
on `PATH`; cases whose toolchain is missing are skipped and listed. The eval's OS sandbox cannot read your home
directory or `/tmp`, and outside system locations it only lets runs read directories on `PATH` and their subtrees. A
toolchain installed under your home directory therefore fails inside runs (`operation not permitted`, or `blocked by
sandbox` for its `lib/` directory) even though `validate-fixtures.mjs` passes outside the sandbox. Install toolchains
elsewhere (for example `/Users/Shared` on macOS) and put each toolchain's root directory on `PATH` as well as its `bin/`.
The analysis report warns when a case fails in every run of every arm. The eval sandbox has no network, so no case downloads
dependencies.

The manually triggered GitHub workflow `Evals (manual, paid)` runs the same commands with a budget input and uploads the
report as an artifact. It fails if correctness in any arm drops more than a configurable number of points below arm A.

## Results

- Research suite, 360 runs: [docs/results/research-2026-11-24.md](results/research-2026-11-24.md).
- Smoke suite pilot, 32 runs: [docs/results/smoke-2026-11-24.md](results/smoke-2026-11-24.md).

## Limitations

- The model under test, judge model, and Claude Code version shape the results. Results for one model do not transfer
  automatically to another.
- LLM judges are noisy and have their own taste; swapping order controls position bias but not every bias.
- Several metrics are approximations (cognitive complexity, identifier quality, revision labels).
- The classifier-based comment count is circular for arms C and D, which is why the lexer-only count is primary.
- Cases are small, self-contained projects. Long-running work in large codebases may behave differently.
- Correctness depends on Claude running the tests and saving their output; the pinned counts and test-intact graders
  make fabrication or test deletion visible, but a determined agent could still fake a results file.
