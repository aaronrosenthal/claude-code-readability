# readability

**Make the code explain itself.**

A Claude Code plugin that teaches Claude to write intrinsically readable code and deterministically rejects newly
introduced comments that only compensate for unclear code. It ships a skill, a `PreToolUse` hook, a language-aware
comment classifier for 31 languages, and an evaluation suite designed to test whether any of this actually helps.

> Status: v0.1.1, experimental. The hypothesis below is **not proven**. See [Evaluation results](#evaluation-results)
> for what has been measured so far, including where the plugin did not help.

## The observation

AI coding agents narrate. Ask for a function and you often get

```python
# Loop through each item in the list
for item in items:
    # Check if the item is active
    if item.status == 3:  # 3 = active
        # Add the price to the total
        total += item.p * item.q
```

The comments are a symptom. Each one marks a place where the code could have said the same thing itself: a named
status, a descriptive attribute, an expression instead of an accumulator. Deleting the comments would not fix anything.
Making them *unnecessary* would.

## The hypothesis

> Restricting unnecessary comments with a deterministic hook, combined with guidance on what to do instead, causes
> Claude to make structural readability improvements (naming, control flow, types, decomposition) without sacrificing
> correctness or adding unnecessary abstraction.

The hypothesis can fail in several ways, and the evaluation measures each of them: Claude might only delete comments,
invent gratuitous helpers to avoid writing one, break tests, churn unrelated code, route around the hook through the
shell, lose context that only a comment could carry, or spend far more tokens.

## This is not an anti-comment plugin

Comments that carry information the code cannot express are kept and expected:

- business and regulatory constraints, security and concurrency invariants
- compatibility workarounds and third-party limitations (with a link)
- historical decisions behind surprising code
- license headers
- public API documentation, especially when the project's linters require it
- machine-read directives: `//go:build`, `# type: ignore[attr-defined]`, `/* @__PURE__ */`,
  `// eslint-disable-next-line no-console -- CLI output`, `# frozen_string_literal: true`, and many more

Project conventions win. If RuboCop requires class documentation, ESLint requires JSDoc, Ruff requires docstrings, or
.NET fails the build on CS1591, the plugin allows that documentation and blocks attempts to suppress the rule or edit the
linter configuration instead of writing it.

## How it works

```
Claude proposes Write / Edit / NotebookEdit ──► PreToolUse hook (local, deterministic, ~0.1 s)
                                                  │
         diff old vs new file, lex both ◄─────────┘
         keep only newly introduced comments
         classify each one:
           mechanically necessary  directive, pragma, type annotation, license, shebang  → allow
           semantically necessary  exception tag, required docs, external reference      → allow
           unnecessary             narration, restating code, explaining a bad name,
                                   commented-out code, TODO, unjustified suppression       → flag
                                                  │
         advisory (default): note with file:line and reason ──► Claude decides
         balanced / strict:  deny with file:line, reason, and what to do instead ──► Claude revises the code
```

- **The skill** (`readable-code`) explains the principles: treat a comment that says *what* the code does as a smell,
  fix names, control flow, and types first, avoid over-abstraction, write comments that say *why* when the code cannot,
  and how to respond to a rejection. It is loaded when Claude writes or edits code.
- **The hook** enforces the part that can be checked deterministically. It never rewrites code, makes no network or
  model calls, fails open on anything it cannot parse with confidence, and releases an edit after repeated identical
  rejections so Claude cannot get stuck.
- **The classifier** lexes each language properly (strings, template literals, regexes, raw strings, heredocs, nested
  comments, JSX, embedded `<script>`), so `"http://example.com"` or `'# not a comment'` is never mistaken for a comment.
  Directive recognition follows each tool's documented grammar, and recognized suppressions go through a separate
  policy: name the rule, use the narrowest scope, give a reason in the tool's syntax.

In `balanced` or `strict` mode, a rejection looks like this:

```
readability: This edit introduces 2 comments that look unnecessary or unauthorized.

- billing/shipping.py:14  # days until expiry
  reason: explains the unclear name "d"; a descriptive name would make the comment unnecessary
- billing/shipping.py:21  # noqa
  reason: blanket Ruff / Flake8 suppression; name the specific rule instead of disabling everything

Treat the perceived need for this comment as a potential readability smell. Reconsider whether naming, types, control
flow, domain modeling, or function decomposition can express the same intent directly. ...
```

## Before and after

These examples are illustrative, written to show the kind of change the skill and hook ask for. They are not eval
output; see [Evaluation results](#evaluation-results) for measured behavior.

**A comment that decodes a condition becomes a name and a type.**

```typescript
// Before
// only charge late fee if overdue by more than the grace period and not a VIP
if (now - inv.due > 5 * 86400000 && inv.cust.tier !== 2) {
  fee = inv.amt * 0.015;
}

// After
const GRACE_PERIOD = Temporal.Duration.from({ days: 5 });
const LATE_FEE_RATE = 0.015;

const isPastGracePeriod = Temporal.Instant.compare(now, invoice.dueAt.add(GRACE_PERIOD)) > 0;
if (isPastGracePeriod && invoice.customer.tier !== CustomerTier.Vip) {
  lateFee = invoice.amount * LATE_FEE_RATE;
}
```

**Narrated steps become straight-line code with a guard clause.**

```go
// Before
func Deliver(w Webhook) error {
	// check if endpoint is set
	if w.URL != "" {
		// sign the payload
		sig := sign(w.Secret, w.Body)
		// send it
		return post(w.URL, w.Body, sig)
	} else {
		return ErrNoEndpoint
	}
}

// After
func Deliver(w Webhook) error {
	if w.URL == "" {
		return ErrNoEndpoint
	}
	return post(w.URL, w.Body, sign(w.Secret, w.Body))
}
```

**A comment that cannot be replaced by code stays, tagged.**

```rust
// SAFETY: `index < self.len` was checked above, and slots below `len` are always initialized.
unsafe { self.slots.get_unchecked(index).assume_init_ref() }
```

**Required documentation is written, not suppressed.**

```ruby
# Before (rejected: suppresses the documentation rule the project enables)
class RefundPolicy # rubocop:disable Style/Documentation

# After
# Decides whether an order can be refunded automatically. Orders older than 30 days need
# manual approval per finance policy FIN-12.
class RefundPolicy
```

## Installation

```bash
claude plugin marketplace add aaronrosenthal/claude-code-readability
claude plugin install readability@readability-plugins
```

Or inside Claude Code: `/plugin marketplace add aaronrosenthal/claude-code-readability`, then
`/plugin install readability@readability-plugins`. Requires Node.js 20+ on `PATH` (Claude Code's own requirement).

To try it without installing: `git clone` the repository and run `claude --plugin-dir ./claude-code-readability`.

## Configuration

No configuration is required. To adapt it, add `.readability.json` to your project (or `~/.claude/readability.json` for
personal defaults; the project file wins):

```json
{
  "$schema": "https://raw.githubusercontent.com/aaronrosenthal/claude-code-readability/main/schema/readability.schema.json",
  "mode": "balanced",
  "languages": { "sql": { "mode": "off" } },
  "exceptions": { "tags": ["SAFETY", "SECURITY", "INVARIANT", "COMPAT", "WORKAROUND", "CONSTRAINT", "HISTORY", "LEGAL"] },
  "suppressions": { "allow": { "eslint": ["no-console"] } }
}
```

| Mode | Behavior |
| :- | :- |
| `strict` | rejects any new comment that is not a directive, tagged exception, or required documentation; new suppressions need an allowlist entry |
| `balanced` | rejects narration and other unnecessary comments; accepts license headers, external references, non-restating public docs, and specific, justified suppressions |
| `advisory` (default) | classifies like `balanced`, but only tells Claude which comments and suppressions look unnecessary; still asks you before edits to the readability config or edits that weaken a linter's documentation rules |
| `off` | disabled |

The default is `advisory` because in the research eval most of the comments the blocking modes rejected were judged
necessary (see [Evaluation results](#evaluation-results)). Use `balanced` or `strict` if you want enforcement.
`READABILITY_MODE=balanced claude` overrides the mode for one session. See [docs/configuration.md](docs/configuration.md)
for every option and [docs/discovery.md](docs/discovery.md) for how linter documentation requirements are detected.

## Supported languages and directives

| Tier | Languages |
| :- | :- |
| 1 (full) | TypeScript, TSX, JavaScript, JSX, Python, Go, Rust, Java, C#, C, C++ |
| 2 (standard) | Kotlin, Swift, Dart, Ruby, PHP, Shell, SQL, CSS, SCSS/Less, HTML, Vue, Svelte, XML, YAML, TOML, HCL/Terraform, Dockerfile |
| 3 (basic) | Lua, Elixir, R |

41 directive families are recognized, including ESLint, TypeScript, Biome, Prettier, Stylelint, coverage tools, bundler
annotations, Ruff/Flake8, Pylint, mypy/Pyright, Black/isort, Bandit, golangci-lint, Staticcheck, Go compiler
directives, clang-tidy, clang-format, cppcheck, IWYU, ReSharper, SonarQube, PMD, Checkstyle, SwiftLint, Dart analyzer,
RuboCop/Standard, Sorbet/RBS, PHPStan/Psalm/PHPCS, ShellCheck, SQLFluff and migration tools, TFLint/tfsec/Trivy/Checkov,
yamllint, ansible-lint, Hadolint, Docker parser directives, Luacheck/LuaLS, Credo, lintr, and SPDX. The full table with
links to each tool's documentation is in [docs/directives.md](docs/directives.md). Unsupported file types are not checked.

## Known limitations

- **Shell writes are mostly unchecked.** Only `cat > file <<EOF` and `tee file <<EOF` with literal paths are analyzed;
  `printf`, `sed -i`, scripts, and MCP tools that write files are not. In the research eval, agents wrote source files
  through the shell (often `python3 -` scripts) 0.27 to 0.68 times per run, depending on the arm, with or without the plugin. 29
  of them came after a rejection (16 runs, nearly all in arm C). The final code of those runs had no comment the hook
  would reject, so none smuggled a comment past it. Still, these writes are not checked.
- **Reason comments about facts are often rejected.** In the research eval, the blinded audit labeled most of the
  comments the hook rejected as necessary (66% in arm C, after the 0.1.1 fixes). These comments state constraints or
  facts without causal words like "because", for example "Caller must hold the lock", or "Letters that don't decompose
  under NFD". If this happens in your code, add an exception tag, or set that language to `advisory` mode with a
  language override, and please report the example.
- **The skill can suppress useful comments.** In the same eval, a blinded judge preferred code written without the
  plugin when it could see the comments, mainly because that code kept domain rules and the reasons for non-obvious
  choices.
- **Classification is heuristic.** "Restates the code" and "explains a name" are judged from word overlap and simple
  patterns, not understanding. In balanced mode, a prose comment that is not a directive, a tagged exception, a
  reference, a license, or acceptable documentation is rejected, so some legitimate comments need an exception tag.
  That is a false-positive risk, and the evaluation's comment audit measures it.
- **Linter discovery is partial.** Configuration is read, never executed; shared configs, gems, and executable config
  logic are reported as unresolved and documentation is allowed in that case.
- **It is a guardrail, not a security boundary.** See [docs/trust-model.md](docs/trust-model.md).
- **Not every language is equal.** Tier 2 and 3 languages have fewer tests and no documentation-declaration detection.

## Development

```bash
npm install
npm test                    # 170+ unit and integration tests
npm run lint                # Biome
npm run bench               # benchmark (results below)
claude plugin validate .
node evals/tools/validate-fixtures.mjs   # every eval fixture, reference solution, and deterministic grader
```

### Performance

Measured on an Apple M4 Pro, Node 26 (`npm run bench`; full table in [benchmarks/RESULTS.txt](benchmarks/RESULTS.txt)):

| File | Lines | Analysis (median) |
| :- | -: | -: |
| TypeScript | 1,000 | 4.4 ms |
| TypeScript | 10,000 | 55 ms |
| Python | 10,000 | 59 ms |
| Java | 10,000 | 37 ms |

The whole hook process for a typical edit (Node startup, config, discovery, analysis) takes about 107 ms (median). CI
fails if analysis of a 10,000-line file exceeds 1.5 s or the hook process exceeds 1 s.

## Evaluation

The suite uses the native [`claude plugin eval`](https://code.claude.com/docs/en/plugin-evals) framework: 4 smoke cases
and 45 research cases across Python, TypeScript, Go, Rust, Java, C#, and Ruby, covering financial calculations, state
machines, async orchestration, concurrency, database queries, date handling, legacy code with pre-existing comments, bug
fixes in unfamiliar code, code that genuinely needs a suppression or a compatibility note, projects whose linters require
documentation, attempts to circumvent those linters, conflicting and unresolved configurations, and code that is already
readable and should barely change.

Four arms differ only in the treatment: **A** no plugin (the framework's native baseline), **B** skill only, **C** blocking hook
with minimal feedback, **D** full plugin in its default mode. Correctness is a hard gate. Readability is judged pairwise by a blinded model
on code with comments normalized away, so fewer comments cannot win by themselves, with randomized and swapped
presentation order. Methodology, metrics, and limitations: [docs/evaluation.md](docs/evaluation.md).

### Evaluation results

The research suite ran on 2026-11-24 with the v0.1.0 hook and `claude-sonnet-5-5`: 45 cases × 4 arms × 2 runs = 360
runs, $49.27 for the agents and $7.25 for blinded judging and the comment audit. Full report and caveats:
[docs/results/research-2026-11-24.md](docs/results/research-2026-11-24.md).

| Metric (mean per run) | A: no plugin | B: skill | C: hook, minimal | D: full |
| :- | -: | -: | -: | -: |
| Correctness | 100% | 100% | 96%¹ | 99% |
| New non-directive comment lines | 2.91 | 2.07 | 1.72 | 1.98 |
| Approx. cognitive complexity | 14.8 | 11.4 | 14.4 | 11.1 |
| Maintainability grader PASS (per run) | 58% | 79% | 52% | 76% |
| Hook rejections | n/a | n/a | 0.52 | 0.17 |
| Rejected comments judged necessary | n/a | n/a | 68% | 53% |
| Tokens | 86k | 99k | 97k | 102k |
| Cost (USD) | 0.08 | 0.10 | 0.09 | 0.10 |

¹ All four failures were caused by two hook bugs that are fixed in 0.1.1.

Blinded pairwise judge, A vs D, decisive comparisons only:

| Question | D preferred |
| :- | -: |
| Readability, comments removed | 77% [64%, 87%] |
| Identifiers, comments removed | 100% (47 of 47) |
| Maintainability, code as written | 37% [26%, 49%] |

What this means:

- **The hypothesis is partly supported, and mostly by the skill.** With the skill, the code was more readable
  structurally and had lower complexity, and correctness held. Arm B (skill only) did about as well as D. The hook
  fired only 0.17 times per run in D. Arm C (hook without the skill) mostly deleted comments (16 of 24 revisions) and
  did not reduce complexity.
- **The plugin removes comments worth keeping.** With comments visible, the pairwise judge preferred the code written
  without the plugin. In 39 of its 41 rationales, it cites context that D left out, such as the rule behind a regex or
  the reason for a numeric clamp. The per-run maintainability grader, which used a different model and judged each run
  alone, favored D. Treat this as an open problem, not a tie.
- **The hook's precision is poor.** Even after the 0.1.1 fixes, about two thirds of the comments it rejected in arm C
  were judged necessary.

[Smoke suite pilot](docs/results/smoke-2026-11-24.md) (32 runs): the same direction with very wide intervals.

### Reproduce

```bash
node evals/tools/run-arms.mjs --tag smoke --runs 2 --budget 12        # all four arms
node evals/tools/analyze.mjs evals/results/arms/<timestamp>
node evals/tools/blind-judge.mjs evals/results/arms/<timestamp> --pairs A:D,B:D,C:D --audit-comments --budget 3
node evals/tools/analyze.mjs evals/results/arms/<timestamp>

node evals/tools/run-arms.mjs --tag research --runs 3 --budget 300    # full research suite
```

## Prior research

- **Self-Refine** (Madaan et al., 2023, [arXiv:2303.17651](https://arxiv.org/abs/2303.17651)) has a model critique and
  revise its own output in a loop without extra training. Across seven tasks, including code readability improvement
  and code optimization, the authors report outputs that are preferred and score "∼20% absolute on average" better
  than one-shot generation. For code readability, measured as the fraction of variables GPT-4 judges appropriately
  named in context, scores rose from 37.4 to 51.3 (GPT-3.5), 27.7 to 63.1 (ChatGPT), and 27.4 to 56.2 (GPT-4). This plugin borrows the idea of feedback-driven
  revision, but its feedback is deterministic and narrow (one class of smell), not a model's free-form self-critique.
- **From Restructuring to Stabilization** (Peitek, Hess, and Apel, 2026, [arXiv:2602.21833](https://arxiv.org/abs/2602.21833),
  preprint) asks GPT-5.1 to iteratively refactor 230 Java files for readability over five iterations, with three code
  variants and three prompts (10,350 snippets). Early iterations restructure heavily, with renaming dominating the
  first step; later ones mostly leave code alone (unchanged lines rose from about 45% to about 92%). Test pass rates
  stayed high but dropped slightly (99.49% to 98.24%). The study measures structural and change metrics rather than
  human-judged readability, uses one model with single runs, and its section on novel code was still marked
  unfinished in the version reviewed here.

Neither paper studies comment restrictions. Self-Refine shows that feedback loops can improve generated code on
automatic metrics; Peitek et al. show that LLM readability refactoring converges and carries a small correctness cost.
Whether *blocking unnecessary comments* triggers useful restructuring rather than mere deletion is this project's
open question, which is why correctness, churn, abstraction, and "comment deletion only" revisions are all measured.

## Contributing

Additional languages, directive families, linter resolvers, and eval cases are welcome. See
[CONTRIBUTING.md](CONTRIBUTING.md); every directive needs a link to the tool's documentation and positive and negative
fixtures, and every eval case needs a reference solution that passes its graders.

## License

[MIT](LICENSE)
