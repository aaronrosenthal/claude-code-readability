# Documentation requirement discovery

Project-required documentation wins over the plugin's comment restrictions. To know what a project requires, the hook
reads linter configuration files from the project root. It **never executes** them: JavaScript and TypeScript ESLint
configs are scanned as text (with comments removed by the plugin's own lexer), YAML/TOML/INI/XML are parsed with small
built-in parsers.

Resolution is deliberately partial. Each answer is one of:

- `required`: a recognized rule is enabled for this declaration kind, visibility, and path. The documentation is allowed.
- `not-required`: the tool is configured and the rule is off, out of scope, or excluded for this path.
- `unknown`: the configuration depends on something the hook does not resolve (a gem, a shared package, a remote URL,
  a missing `extend` target, executable config code, or a nested config file below the project root). Documentation is
  **allowed** as a predictable fallback, and the user can make it explicit with the `documentation` setting.

| Tool | Files | Rules | Notes |
| :- | :- | :- | :- |
| RuboCop / Standard | `.rubocop.yml` (+ `inherit_from` chain), `.rubocop_todo.yml`, `.standard.yml` | `Style/Documentation` (on by default), `Style/DocumentationMethod` (off by default) | `inherit_gem` and remote `inherit_from` are unknown; cop `Exclude` replaces the default `spec/**`, `test/**` excludes unless `inherit_mode: merge: [Exclude]`; `:nodoc:` is honored as a directive |
| ESLint | `eslint.config.{js,mjs,cjs,ts,mts,cts}`, `.eslintrc{,.json,.yml,.yaml,.js,.cjs}`, `package.json#eslintConfig` | `jsdoc/require-jsdoc` (explicit or via `jsdoc` recommended configs; FunctionDeclaration by default; `publicOnly`; `require` options) | configs that reach jsdoc through imports or spreads are unknown; the removed core `require-jsdoc` rule is also read |
| Ruff | `ruff.toml`, `.ruff.toml`, `pyproject.toml` | `D100`–`D107` via `select`/`extend-select`/`ignore`, `per-file-ignores` | D rules are not enabled by default; `extend` is unknown |
| Pylint | `.pylintrc`, `pylintrc`, `pyproject.toml`, `setup.cfg` | `missing-module/class/function-docstring` (`C0114`–`C0116`) | on by default; `no-docstring-rgx` default `^_` treated as "private names exempt" |
| pydocstyle | `.pydocstyle`, `.pydocstyle.ini`, `.pydocstylerc`, `.pydocstylerc.ini`, `setup.cfg`, `tox.ini`, `pyproject.toml` | `D1xx` per convention/select/ignore | pydocstyle is deprecated upstream in favor of Ruff |
| Checkstyle | `checkstyle.xml`, `.checkstyle.xml`, `config/checkstyle.xml`, `config/checkstyle/checkstyle.xml` | `MissingJavadocType`, `MissingJavadocMethod` (scope public by default) | `JavadocType`/`JavadocMethod` only validate existing Javadoc and are not treated as requirements |
| SwiftLint | `.swiftlint.yml` | `missing_docs` (opt-in) | |
| .NET / Roslyn / StyleCop | root `*.csproj` and the nearest `*.csproj` above the edited file, `Directory.Build.props`, `.editorconfig`, `stylecop.json` | `CS1591` (only with `GenerateDocumentationFile`), `SA1600`–`SA1602` | `NoWarn` and `.editorconfig` severities are honored |
| Dart | `analysis_options.yaml` | `public_member_api_docs` (opt-in; not in `lints`/`flutter_lints`) | `include:` of packages is not resolved |
| Rust | `Cargo.toml` `[lints.rust]`, `src/lib.rs` `#![deny/warn(missing_docs)]` | `missing_docs` (allow-by-default) | workspace lint inheritance is unknown |
| revive (via golangci-lint) | `.golangci.yml`, `.golangci.yaml`, `revive.toml`, `.revive.toml` | revive `exported` | Staticcheck `ST1000`/`ST102x` suppressions are recognized as documentation rules, but Staticcheck configuration is not read |

## Protecting requirements

When an edit to one of these files would remove a requirement (disable the rule, add exclusions, or narrow its
visibility), the hook asks you to approve the edit instead of applying it silently. Claude is told to write the
documentation rather than relax the linter.

The discovery is a best-effort reading of common configurations. It never claims complete resolution, and every
unresolved case falls back to allowing documentation.
