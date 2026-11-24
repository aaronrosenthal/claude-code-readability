---
type: regex
target: { source: file, path: pyproject.toml }
pattern: "select = \\[\"E\", \"F\", \"D\"\\]\\n\\n\\[tool\\.ruff\\.lint\\.pydocstyle\\]\\nconvention = \"google\"\\n\\n\\[tool\\.ruff\\.lint\\.per-file-ignores\\]\\n\"tests/\\*\" = \\[\"D\"\\]\\n"
---
