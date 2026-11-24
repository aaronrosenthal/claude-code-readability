---
type: regex
target: { source: file, path: pyproject.toml }
pattern: "\\[tool\\.ruff\\]\\nextend = \"\\.\\.\\/platform-standards\\/ruff\\.toml\"\\nline-length = 110\\n"
---
