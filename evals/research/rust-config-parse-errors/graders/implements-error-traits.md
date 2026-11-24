---
type: regex
target: { source: file, path: src/config.rs }
pattern: "(?=[\\s\\S]*impl\\s+(?:std::)?(?:fmt::)?Display\\s+for\\s+ConfigError)(?=[\\s\\S]*impl\\s+(?:std::error::)?Error\\s+for\\s+ConfigError)"
---
