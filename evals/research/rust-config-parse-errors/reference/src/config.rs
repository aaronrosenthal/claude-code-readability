use std::collections::HashMap;
use std::error::Error;
use std::fmt;

const DEFAULT_WORKERS: usize = 4;
const KNOWN_KEYS: [&str; 5] = ["host", "port", "workers", "log_level", "tls"];

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

impl fmt::Display for ConfigError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ConfigError::MissingSeparator { line } => {
                write!(f, "line {}: expected `key = value`", line)
            }
            ConfigError::UnknownKey { line, key } => {
                write!(f, "line {}: unknown key `{}`", line, key)
            }
            ConfigError::DuplicateKey { line, key } => {
                write!(f, "line {}: duplicate key `{}`", line, key)
            }
            ConfigError::InvalidValue { line, key, value } => {
                write!(f, "line {}: invalid value `{}` for `{}`", line, value, key)
            }
            ConfigError::MissingKey { key } => write!(f, "missing required key `{}`", key),
        }
    }
}

impl Error for ConfigError {}

struct Setting<'a> {
    line: usize,
    value: &'a str,
}

pub fn parse(input: &str) -> Result<ServiceConfig, ConfigError> {
    let settings = read_settings(input)?;

    let host = lookup(&settings, "host", parse_host)?.ok_or(ConfigError::MissingKey { key: "host" })?;
    let port = lookup(&settings, "port", parse_port)?.ok_or(ConfigError::MissingKey { key: "port" })?;
    let workers = lookup(&settings, "workers", parse_workers)?.unwrap_or(DEFAULT_WORKERS);
    let log_level = lookup(&settings, "log_level", parse_log_level)?.unwrap_or(LogLevel::Info);
    let tls = lookup(&settings, "tls", parse_bool)?.unwrap_or(false);

    Ok(ServiceConfig { host, port, workers, log_level, tls })
}

fn read_settings(input: &str) -> Result<HashMap<&str, Setting<'_>>, ConfigError> {
    let mut settings = HashMap::new();
    for (index, raw_line) in input.lines().enumerate() {
        let line = index + 1;
        let text = raw_line.trim();
        if text.is_empty() || text.starts_with('#') {
            continue;
        }

        let (key, value) = text
            .split_once('=')
            .ok_or(ConfigError::MissingSeparator { line })?;
        let key = key.trim();
        if !KNOWN_KEYS.contains(&key) {
            return Err(ConfigError::UnknownKey { line, key: key.to_string() });
        }
        if settings.insert(key, Setting { line, value: value.trim() }).is_some() {
            return Err(ConfigError::DuplicateKey { line, key: key.to_string() });
        }
    }
    Ok(settings)
}

fn lookup<T>(
    settings: &HashMap<&str, Setting<'_>>,
    key: &str,
    parse_value: fn(&str) -> Option<T>,
) -> Result<Option<T>, ConfigError> {
    let Some(setting) = settings.get(key) else {
        return Ok(None);
    };
    match parse_value(setting.value) {
        Some(value) => Ok(Some(value)),
        None => Err(ConfigError::InvalidValue {
            line: setting.line,
            key: key.to_string(),
            value: setting.value.to_string(),
        }),
    }
}

fn parse_host(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_string())
}

fn parse_port(value: &str) -> Option<u16> {
    value.parse().ok().filter(|&port| port != 0)
}

fn parse_workers(value: &str) -> Option<usize> {
    value.parse().ok().filter(|&workers| workers != 0)
}

fn parse_log_level(value: &str) -> Option<LogLevel> {
    match value {
        "error" => Some(LogLevel::Error),
        "warn" => Some(LogLevel::Warn),
        "info" => Some(LogLevel::Info),
        "debug" => Some(LogLevel::Debug),
        _ => None,
    }
}

fn parse_bool(value: &str) -> Option<bool> {
    match value {
        "true" => Some(true),
        "false" => Some(false),
        _ => None,
    }
}
