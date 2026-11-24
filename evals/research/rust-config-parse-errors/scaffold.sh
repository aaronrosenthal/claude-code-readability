#!/usr/bin/env bash
set -euo pipefail
cat > .gitignore <<'EOF'
/target
Cargo.lock
EOF
cat > Cargo.toml <<'EOF'
[package]
name = "relayd"
version = "0.8.1"
edition = "2021"

[dependencies]
EOF
mkdir -p src
cat > src/config.rs <<'EOF'
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ServiceConfig {
    pub host: String,
    pub port: u16,
    pub workers: usize,
    pub log_level: LogLevel,
    pub tls: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub enum ConfigError {
    MissingSeparator { line: usize },
    UnknownKey { line: usize, key: String },
    DuplicateKey { line: usize, key: String },
    InvalidValue { line: usize, key: String, value: String },
    MissingKey { key: &'static str },
}

pub fn parse(input: &str) -> Result<ServiceConfig, ConfigError> {
    todo!()
}
EOF
mkdir -p src
cat > src/lib.rs <<'EOF'
pub mod config;

pub use config::{parse, ConfigError, LogLevel, ServiceConfig};
EOF
mkdir -p tests
cat > tests/config.rs <<'EOF'
use relayd::{parse, ConfigError, LogLevel, ServiceConfig};

fn invalid(line: usize, key: &str, value: &str) -> ConfigError {
    ConfigError::InvalidValue { line, key: key.to_string(), value: value.to_string() }
}

#[test]
fn parses_a_complete_config() {
    let input = "\
host = relay.internal
port = 8443
workers = 16
log_level = debug
tls = true
";
    assert_eq!(
        parse(input),
        Ok(ServiceConfig {
            host: "relay.internal".to_string(),
            port: 8443,
            workers: 16,
            log_level: LogLevel::Debug,
            tls: true,
        })
    );
}

#[test]
fn optional_keys_have_defaults() {
    let config = parse("host = localhost\nport = 9000\n").unwrap();
    assert_eq!(config.workers, 4);
    assert_eq!(config.log_level, LogLevel::Info);
    assert!(!config.tls);
}

#[test]
fn ignores_comments_blank_lines_and_extra_spaces() {
    let input = "# relay settings\n\n   host=example.org  \n  port =   80\n\n# end\n";
    let config = parse(input).unwrap();
    assert_eq!(config.host, "example.org");
    assert_eq!(config.port, 80);
}

#[test]
fn reports_missing_required_keys() {
    assert_eq!(parse("port = 80\n"), Err(ConfigError::MissingKey { key: "host" }));
    assert_eq!(parse("host = a\n"), Err(ConfigError::MissingKey { key: "port" }));
}

#[test]
fn reports_unknown_keys_with_their_line_number() {
    let input = "# header\nhost = a\ncolour = blue\nport = 80\n";
    assert_eq!(
        parse(input),
        Err(ConfigError::UnknownKey { line: 3, key: "colour".to_string() })
    );
}

#[test]
fn reports_lines_without_an_equals_sign() {
    assert_eq!(
        parse("host = a\nport 80\n"),
        Err(ConfigError::MissingSeparator { line: 2 })
    );
}

#[test]
fn reports_duplicate_keys_at_the_second_occurrence() {
    let input = "host = a\nport = 80\nhost = b\n";
    assert_eq!(
        parse(input),
        Err(ConfigError::DuplicateKey { line: 3, key: "host".to_string() })
    );
}

#[test]
fn rejects_invalid_values() {
    assert_eq!(parse("host = a\nport = 70000\n"), Err(invalid(2, "port", "70000")));
    assert_eq!(parse("host = a\nport = 0\n"), Err(invalid(2, "port", "0")));
    assert_eq!(parse("host = a\nport = 80\nworkers = 0\n"), Err(invalid(3, "workers", "0")));
    assert_eq!(parse("host = a\nport = 80\nlog_level = loud\n"), Err(invalid(3, "log_level", "loud")));
    assert_eq!(parse("host = a\nport = 80\ntls = yes\n"), Err(invalid(3, "tls", "yes")));
    assert_eq!(parse("host =\nport = 80\n"), Err(invalid(1, "host", "")));
}

#[test]
fn errors_are_described_for_operators() {
    let messages = [
        (ConfigError::MissingSeparator { line: 7 }, "line 7: expected `key = value`"),
        (
            ConfigError::UnknownKey { line: 3, key: "colour".to_string() },
            "line 3: unknown key `colour`",
        ),
        (
            ConfigError::DuplicateKey { line: 9, key: "host".to_string() },
            "line 9: duplicate key `host`",
        ),
        (invalid(2, "port", "70000"), "line 2: invalid value `70000` for `port`"),
        (ConfigError::MissingKey { key: "host" }, "missing required key `host`"),
    ];
    for (error, expected) in messages {
        assert_eq!(error.to_string(), expected);
    }
}

#[test]
fn config_error_is_a_std_error() {
    fn takes_error(_: &dyn std::error::Error) {}
    takes_error(&ConfigError::MissingKey { key: "port" });
}
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
