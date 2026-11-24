---
name: readable-code
description: Write intrinsically readable code that explains itself through names, types, control flow, and structure rather than explanatory comments. Use whenever writing, editing, refactoring, or fixing source code in any language, and whenever an edit is rejected for introducing an unnecessary comment or an unauthorized linter suppression.
when_to_use: Implementing features, fixing bugs, refactoring, adding tests, modifying legacy code, or responding to a "readability:" hook rejection.
---

# Make the code explain itself

The goal is not fewer comments. The goal is code that does not need comments to say *what* it does, plus comments that say *why* wherever the code cannot. When you feel the urge to explain a piece of code, first ask whether the code itself could say it. If it cannot, write the comment.

## Principles

1. **Treat a comment that explains what the code does as a readability smell.** Before writing one, try to make it unnecessary:
   - A comment that names a value → introduce a well-named variable or constant.
   - A comment that explains a block → extract a function whose name says what the block does, but only when that genuinely helps a reader.
   - A comment that decodes a condition → name the condition (`const isEligibleForRefund = ...`).
   - A comment that explains a type, unit, or state → use a type, enum, or domain object that carries that meaning.
   - A comment that explains tricky control flow → straighten the flow (early returns, guard clauses, fewer flags).
2. **Use meaningful identifiers** that communicate domain intent at the right length. `daysUntilExpiry` beats `d // days until expiry`; `numberOfDaysRemainingBeforeTheSubscriptionExpires` is worse than both.
3. **Prefer straightforward control flow** and the language's idioms over cleverness.
4. **Avoid magic values** when a name would make the code clearer. Do not name values whose meaning is already obvious (`0`, `1`, `""`).
5. **Preserve existing behavior.** Readability work must not change what the code does. Run or keep the tests green.
6. **Do not over-engineer.** No gratuitous abstractions, wrapper classes, single-use interfaces, or functions extracted only to avoid a comment. Two clear lines inline beat a one-line function nobody needed.
7. **Stay in scope.** Do not refactor unrelated code or rewrite existing comments that the task does not touch.
8. **Some information cannot be expressed in code.** Write and keep comments that carry it (see below). Removing a comment without improving the code is not an improvement, and code that is clean but leaves out why it works is not finished.

Do not optimize for fewer lines, more functions, longer names, or fewer comments as goals in themselves.

## Comments that belong in code

Keep or write a comment when it records something a reader needs and the code cannot say:

- business or regulatory constraints ("refunds after 30 days need manager approval per policy FIN-12")
- the rule or source behind a literal, pattern, or table whose values look arbitrary, such as which inputs a format excludes and who defines it
- the reason for a check, guard, clamp, ordering, or retry that looks removable but is not
- surprising behavior of the language, runtime, library, or external system that the code relies on or works around (link the issue when there is one)
- preconditions and side effects that callers must respect and the signature cannot express ("caller must hold `mu`"), including on private helpers
- security invariants, concurrency or memory-ordering requirements
- historical decisions that explain otherwise surprising code, and when temporary code can be removed
- license and copyright notices
- public API documentation that the project expects, describing contracts, units, errors, and invariants rather than restating the name

A useful test: if a careful maintainer saw this code without the comment, would they have to look something up outside the code, or be tempted to "simplify" it and break something? If so, the comment belongs. State the fact plainly; it does not need the word "because".

When the readability hook is active, mark such comments with an exception tag so the intent is explicit and auditable: `SAFETY:`, `SECURITY:`, `INVARIANT:`, `CONCURRENCY:`, `COMPAT:`, `WORKAROUND:`, `CONSTRAINT:`, `HISTORY:`, or `LEGAL:` (the project may configure a different list). A tag is a claim that the information cannot live in code; never use it to smuggle in narration. Comments that link an external issue, specification, or advisory are usually accepted as-is.

TODO, FIXME, HACK, and NOTE are not exceptions. Fix the problem, or record a real constraint with a tag.

## Project documentation requirements win

If the project's linters require documentation (for example RuboCop `Style/Documentation`, ESLint `jsdoc/require-jsdoc`, Ruff/pydocstyle `D1xx`, Pylint `missing-*-docstring`, Checkstyle `MissingJavadoc*`, SwiftLint `missing_docs`, .NET `CS1591`/StyleCop `SA1600`, Dart `public_member_api_docs`, Rust `missing_docs`), write that documentation well. Never suppress or disable a documentation rule, and never edit linter configuration to avoid writing documentation.

## Tool directives and suppressions

Machine-consumed comments such as `//go:build`, `# type: ignore[attr-defined]`, `/* @__PURE__ */`, `# frozen_string_literal: true`, or `// eslint-disable-next-line no-console -- reason` are code, not prose. Keep them exactly as the tool documents them.

- Do not add a suppression to make a warning, a test, or this readability check go away. Fix the underlying issue instead.
- When a suppression is genuinely necessary, name the specific rule, use the narrowest scope (next line rather than file), and give the reason with the tool's justification syntax (ESLint/Stylelint/RuboCop/phpcs `-- reason`, Biome `: reason`, staticcheck's trailing reason, golangci-lint `// reason`), or in a comment directly above it when the tool has none.
- Leave existing suppressions untouched unless changing them is part of the task. Never broaden their scope or rule list.
- Do not put explanatory prose inside a directive.

## When an edit is rejected

A `readability:` rejection lists the file, line, comment, and reason. Respond by improving the code, not by rewording the comment:

1. Read the reason. "Restates the code" means the comment adds nothing: delete it. "Explains an unclear name" means rename. "Explains a literal value" means name it.
2. If the comment was compensating for unclear code, restructure the code so the intent is visible: naming, types, a guard clause, a small well-named function.
3. If the code was already clear, simply remove the comment.
4. If the comment carries information the code genuinely cannot express (a reason, a rule, a precondition, an external fact), keep it with an exception tag. Do not delete a reason just to get the edit through.
5. Do not route around the check: no new suppressions, no linter or readability config edits, no shell redirection to write the same comment, and no bare string literals as comments.

After a few identical rejections the hook lets the edit through to avoid a loop. If that happens, tell the user which comments remain so they can decide.

## Example

Before:

```python
def total(items):
    # sum up price times quantity, skipping refunded ones
    t = 0
    for i in items:
        if i.status != 3:  # 3 = refunded
            t += i.p * i.q
    return t
```

After:

```python
def order_total(line_items: list[LineItem]) -> Decimal:
    return sum(
        (item.unit_price * item.quantity for item in line_items if item.status is not LineItemStatus.REFUNDED),
        start=Decimal(0),
    )
```

The comments disappeared because the names, the enum, and the expression now say what they said. The function did not gain abstractions it did not need.

A comment that carries a reason stays, even after the code is cleaned up:

```typescript
// COMPAT: the label printer firmware truncates each line at 32 bytes, not 32 characters,
// so accented names must be measured in UTF-8.
const fitsOnLabel = new TextEncoder().encode(line).length <= LABEL_LINE_BYTES;
```

The constant and the variable name say *what* is checked. Only the comment says why bytes matter. Without it, the next maintainer would likely "fix" this to `line.length`.
