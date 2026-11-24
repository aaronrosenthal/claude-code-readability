import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { defaultConfig, effectiveConfigFor, loadConfig } from '../../src/config/config.mjs';
import { globToRegExp, matchesAny } from '../../src/config/glob.mjs';
import { temporaryProject } from '../helpers.mjs';

function withUserConfig(content) {
  const directory = temporaryProject({ 'readability.json': typeof content === 'string' ? content : JSON.stringify(content) });
  return { READABILITY_USER_CONFIG: path.join(directory, 'readability.json') };
}

test('defaults apply when no configuration exists', () => {
  const root = temporaryProject();
  const { config, warnings } = loadConfig({ projectRoot: root, env: { READABILITY_USER_CONFIG: path.join(root, 'missing.json') } });
  assert.deepEqual(config, defaultConfig());
  assert.deepEqual(warnings, []);
});

test('precedence is defaults, then user, then project, then environment', () => {
  const env = withUserConfig({ mode: 'strict', feedback: 'minimal', retryLimit: 7 });
  const root = temporaryProject({ '.readability.json': JSON.stringify({ mode: 'advisory' }) });
  const { config, sources } = loadConfig({ projectRoot: root, env });
  assert.equal(config.mode, 'advisory', 'project overrides user');
  assert.equal(config.feedback, 'minimal', 'user settings the project does not set are kept');
  assert.equal(config.retryLimit, 7);
  assert.equal(sources.length, 2);
  assert.equal(loadConfig({ projectRoot: root, env: { ...env, READABILITY_MODE: 'off' } }).config.mode, 'off');
});

test('.claude/readability.json is a supported project location', () => {
  const root = temporaryProject({ '.claude/readability.json': JSON.stringify({ mode: 'strict' }) });
  assert.equal(loadConfig({ projectRoot: root, env: { READABILITY_USER_CONFIG: '/nonexistent' } }).config.mode, 'strict');
});

test('nested sections merge key by key', () => {
  const root = temporaryProject({ '.readability.json': JSON.stringify({ suppressions: { allowBlanket: true } }) });
  const { config } = loadConfig({ projectRoot: root, env: { READABILITY_USER_CONFIG: '/nonexistent' } });
  assert.equal(config.suppressions.allowBlanket, true);
  assert.equal(config.suppressions.requireJustification, defaultConfig().suppressions.requireJustification);
});

test('invalid configuration is reported and ignored rather than crashing', () => {
  const env = { READABILITY_USER_CONFIG: '/nonexistent' };
  const broken = temporaryProject({ '.readability.json': '{ not json' });
  const brokenResult = loadConfig({ projectRoot: broken, env });
  assert.equal(brokenResult.config.mode, 'balanced');
  assert.equal(brokenResult.warnings.length, 1);
  const wrongTypes = temporaryProject({ '.readability.json': JSON.stringify({ mode: 'loud', retryLimit: -1, typo: true, documentation: { klass: 'allow' } }) });
  const result = loadConfig({ projectRoot: wrongTypes, env });
  assert.equal(result.config.mode, 'balanced');
  assert.equal(result.config.retryLimit, 3);
  assert.equal(result.warnings.length, 4);
  const array = temporaryProject({ '.readability.json': '[]' });
  assert.equal(loadConfig({ projectRoot: array, env }).warnings.length, 1);
});

test('invalid environment overrides are ignored', () => {
  const root = temporaryProject();
  assert.equal(loadConfig({ projectRoot: root, env: { READABILITY_USER_CONFIG: '/nonexistent', READABILITY_MODE: 'yolo' } }).config.mode, 'balanced');
});

test('mode-dependent defaults resolve per mode', () => {
  const strict = effectiveConfigFor({ ...defaultConfig(), mode: 'strict' }, 'python', 'python');
  assert.equal(strict.suppressions.new, 'deny');
  assert.equal(strict.exceptions.allowExternalReferences, false);
  const balanced = effectiveConfigFor(defaultConfig(), 'python', 'python');
  assert.equal(balanced.suppressions.new, 'justify');
  assert.equal(balanced.exceptions.allowExternalReferences, true);
  assert.equal(effectiveConfigFor({ ...defaultConfig(), mode: 'advisory' }, 'python', 'python').suppressions.new, 'allow');
});

test('language overrides apply by language id or family', () => {
  const config = { ...defaultConfig(), languages: { tsx: { mode: 'advisory' }, python: { mode: 'strict' } } };
  assert.equal(effectiveConfigFor(config, 'tsx', 'javascript').mode, 'advisory');
  assert.equal(effectiveConfigFor(config, 'typescript', 'javascript').mode, 'balanced');
  assert.equal(effectiveConfigFor(config, 'python', 'python').mode, 'strict');
  assert.equal(effectiveConfigFor(config, 'python', 'python').suppressions.new, 'deny');
});

test('effective configuration does not mutate the loaded configuration', () => {
  const config = defaultConfig();
  effectiveConfigFor(config, 'python', 'python');
  assert.equal(config.suppressions.new, 'auto');
});

test('glob matching', () => {
  assert.ok(globToRegExp('**/*.gen.ts').test('src/a/b.gen.ts'));
  assert.ok(globToRegExp('*.min.js').test('dist/app.min.js'), 'patterns without a slash match at any depth');
  assert.ok(!globToRegExp('src/*.ts').test('src/a/b.ts'));
  assert.ok(globToRegExp('src/**').test('src/a/b.ts'));
  assert.ok(globToRegExp('{lib,app}/**/*.rb').test('app/models/user.rb'));
  assert.ok(globToRegExp('file?.py').test('file1.py'));
  assert.ok(matchesAny('vendor/x/y.go', ['node_modules/**', 'vendor/**']));
  assert.ok(!matchesAny('src/vendor.go', ['vendor/**']));
});

test('the published JSON schema lists every configuration key', () => {
  const schemaPath = new URL('../../schema/readability.schema.json', import.meta.url);
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  for (const key of Object.keys(defaultConfig())) assert.ok(key in schema.properties, `schema is missing ${key}`);
});
