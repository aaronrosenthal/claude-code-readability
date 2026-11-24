import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const MODES = ['strict', 'balanced', 'advisory', 'off'];
export const DOCUMENTATION_KINDS = ['module', 'class', 'function', 'method', 'property'];
export const DOCUMENTATION_POLICIES = ['auto', 'allow', 'restrict'];
export const SUPPRESSION_POLICIES = ['auto', 'justify', 'deny', 'allow'];

export const PROJECT_CONFIG_FILES = ['.readability.json', '.claude/readability.json'];

export const DEFAULT_EXCLUDES = [
  '**/node_modules/**',
  '**/vendor/**',
  '**/third_party/**',
  '**/third-party/**',
  '**/.git/**',
  '**/Pods/**',
  '**/__generated__/**',
  '**/*.min.js',
  '**/*.min.css',
  '**/*.bundle.js',
  '**/*.generated.*',
  '**/*.g.dart',
  '**/*.freezed.dart',
  '**/*.pb.go',
  '**/*_pb2.py',
  '**/*_pb2_grpc.py',
  '**/*.designer.cs',
  '**/*.Designer.cs',
];

export const DEFAULT_EXCEPTION_TAGS = ['SAFETY', 'SECURITY', 'INVARIANT', 'CONCURRENCY', 'COMPAT', 'WORKAROUND', 'CONSTRAINT', 'HISTORY', 'LEGAL'];

export function defaultConfig() {
  return {
    mode: 'advisory',
    feedback: 'actionable',
    exclude: [],
    useDefaultExcludes: true,
    languages: {},
    documentation: { module: 'auto', class: 'auto', function: 'auto', method: 'auto', property: 'auto' },
    exceptions: {
      tags: [...DEFAULT_EXCEPTION_TAGS],
      minWords: 4,
      allowExternalReferences: null,
      allowLicenseHeaders: true,
    },
    directives: { custom: [], optional: [] },
    suppressions: {
      new: 'auto',
      requireJustification: true,
      allowBlanket: false,
      allowFileWide: false,
      allow: {},
      deny: {},
    },
    discovery: { enabled: true },
    retryLimit: 3,
    protectConfigFiles: true,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const VALIDATORS = {
  mode: (value) => MODES.includes(value),
  feedback: (value) => value === 'actionable' || value === 'minimal',
  exclude: (value) => Array.isArray(value) && value.every((item) => typeof item === 'string'),
  useDefaultExcludes: (value) => typeof value === 'boolean',
  languages: isPlainObject,
  documentation: (value) => isPlainObject(value) && Object.entries(value).every(([kind, policy]) => DOCUMENTATION_KINDS.includes(kind) && DOCUMENTATION_POLICIES.includes(policy)),
  exceptions: isPlainObject,
  directives: isPlainObject,
  suppressions: isPlainObject,
  discovery: isPlainObject,
  retryLimit: (value) => Number.isInteger(value) && value >= 1 && value <= 50,
  protectConfigFiles: (value) => typeof value === 'boolean',
};

function mergeInto(target, source, origin, warnings) {
  for (const [key, value] of Object.entries(source)) {
    if (key === '$schema' || key === 'description') continue;
    const validate = VALIDATORS[key];
    if (!validate) {
      warnings.push(`${origin}: unknown key "${key}" ignored`);
      continue;
    }
    if (!validate(value)) {
      warnings.push(`${origin}: invalid value for "${key}" ignored`);
      continue;
    }
    if (isPlainObject(value) && isPlainObject(target[key]) && key !== 'languages') {
      target[key] = { ...target[key], ...value };
    } else if (key === 'languages') {
      target.languages = { ...target.languages, ...value };
    } else {
      target[key] = Array.isArray(value) ? [...value] : value;
    }
  }
  return target;
}

function readJson(filePath, warnings) {
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(text);
    if (!isPlainObject(parsed)) {
      warnings.push(`${filePath}: configuration must be a JSON object; ignored`);
      return null;
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    warnings.push(`${filePath}: ${error.message}; ignored`);
    return null;
  }
}

export function userConfigPath(env = process.env) {
  if (env.READABILITY_USER_CONFIG) return env.READABILITY_USER_CONFIG;
  const home = env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude');
  return path.join(home, 'readability.json');
}

export function findProjectConfig(projectRoot) {
  for (const candidate of PROJECT_CONFIG_FILES) {
    const full = path.join(projectRoot, candidate);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

export function loadConfig({ projectRoot, env = process.env } = {}) {
  const warnings = [];
  const sources = [];
  const config = defaultConfig();
  const userPath = userConfigPath(env);
  const user = readJson(userPath, warnings);
  if (user) {
    mergeInto(config, user, userPath, warnings);
    sources.push(userPath);
  }
  const projectPath = projectRoot ? findProjectConfig(projectRoot) : null;
  const project = projectPath ? readJson(projectPath, warnings) : null;
  if (project) {
    mergeInto(config, project, projectPath, warnings);
    sources.push(projectPath);
  }
  if (env.READABILITY_MODE && MODES.includes(env.READABILITY_MODE)) config.mode = env.READABILITY_MODE;
  if (env.READABILITY_FEEDBACK === 'minimal' || env.READABILITY_FEEDBACK === 'actionable') config.feedback = env.READABILITY_FEEDBACK;
  return { config, warnings, sources };
}

export function effectiveConfigFor(config, languageId, family) {
  const override = config.languages?.[languageId] ?? config.languages?.[family];
  const merged = override ? mergeInto(structuredClone(config), override, `languages.${languageId}`, []) : structuredClone(config);
  const strict = merged.mode === 'strict';
  if (merged.exceptions.allowExternalReferences === null) merged.exceptions.allowExternalReferences = !strict;
  if (merged.suppressions.new === 'auto') {
    merged.suppressions.new = strict ? 'deny' : 'justify';
  }
  return merged;
}

export function excludePatterns(config) {
  return [...(config.useDefaultExcludes ? DEFAULT_EXCLUDES : []), ...config.exclude];
}
