import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discoverDocumentationRequirements, resolveRequirements, weakenedRequirements } from '../../src/discovery/index.mjs';
import { temporaryProject } from '../helpers.mjs';

function resolve(files) {
  const read = (relative) => (relative in files ? files[relative] : null);
  return resolveRequirements(read, () => Object.keys(files)).requirements;
}

function statusFor(files, family, kind, visibility = 'public', relativePath = 'src/file') {
  const root = temporaryProject(files);
  return discoverDocumentationRequirements({ projectRoot: root }).requirementFor(family, kind, visibility, relativePath).status;
}

test('RuboCop: Style/Documentation is on by default once RuboCop is configured', () => {
  assert.equal(statusFor({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' }, 'ruby', 'class'), 'required');
  assert.equal(statusFor({ '.rubocop.yml': 'Style/Documentation:\n  Enabled: false\n' }, 'ruby', 'class'), 'not-required');
  assert.equal(statusFor({}, 'ruby', 'class'), 'not-required');
});

test('RuboCop: Style/Documentation excludes specs by default and honors Exclude', () => {
  assert.equal(statusFor({ '.rubocop.yml': 'AllCops: {}\n' }, 'ruby', 'class', 'public', 'spec/models/user_spec.rb'), 'not-required');
  const files = { '.rubocop.yml': 'Style/Documentation:\n  Exclude:\n    - "app/legacy/**/*"\n' };
  assert.equal(statusFor(files, 'ruby', 'class', 'public', 'spec/models/user_spec.rb'), 'required', 'a cop-level Exclude replaces the defaults');
  const merged = { '.rubocop.yml': 'inherit_mode:\n  merge:\n    - Exclude\nStyle/Documentation:\n  Exclude:\n    - "app/legacy/**/*"\n' };
  assert.equal(statusFor(merged, 'ruby', 'class', 'public', 'spec/models/user_spec.rb'), 'not-required', 'inherit_mode merge keeps the defaults');
  assert.equal(statusFor(files, 'ruby', 'class', 'public', 'app/legacy/old.rb'), 'not-required');
  assert.equal(statusFor(files, 'ruby', 'class', 'public', 'app/models/user.rb'), 'required');
});

test('RuboCop: inherit_from is followed and inherit_gem is reported as unresolved', () => {
  const inherited = { '.rubocop.yml': 'inherit_from: .rubocop_base.yml\n', '.rubocop_base.yml': 'Style/Documentation:\n  Enabled: false\n' };
  assert.equal(statusFor(inherited, 'ruby', 'class'), 'not-required');
  const gem = { '.rubocop.yml': 'inherit_gem:\n  company_style: default.yml\n' };
  assert.equal(statusFor(gem, 'ruby', 'class'), 'unknown');
});

test('RuboCop: Style/DocumentationMethod is opt-in', () => {
  assert.equal(statusFor({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' }, 'ruby', 'method'), 'not-required');
  assert.equal(statusFor({ '.rubocop.yml': 'Style/DocumentationMethod:\n  Enabled: true\n' }, 'ruby', 'method'), 'required');
});

test('ESLint: jsdoc/require-jsdoc from explicit rules, recommended configs, and package.json', () => {
  const flat = {
    'eslint.config.js': 'import jsdoc from "eslint-plugin-jsdoc";\nexport default [{ rules: { "jsdoc/require-jsdoc": ["error", { require: { ClassDeclaration: true } }] } }];\n',
  };
  assert.equal(statusFor(flat, 'typescript', 'class'), 'required');
  assert.equal(statusFor(flat, 'typescript', 'function'), 'required');
  const recommended = { 'eslint.config.mjs': 'import jsdoc from "eslint-plugin-jsdoc";\nexport default [jsdoc.configs["flat/recommended"]];\n' };
  assert.equal(statusFor(recommended, 'javascript', 'function'), 'required');
  assert.equal(statusFor(recommended, 'javascript', 'class'), 'not-required', 'require-jsdoc defaults to FunctionDeclaration only');
  const legacy = { 'package.json': JSON.stringify({ eslintConfig: { extends: ['plugin:jsdoc/recommended'] } }) };
  assert.equal(statusFor(legacy, 'javascript', 'function'), 'required');
  const off = { '.eslintrc.json': '{ "extends": ["plugin:jsdoc/recommended"], "rules": { "jsdoc/require-jsdoc": "off" } }' };
  assert.equal(statusFor(off, 'javascript', 'function'), 'not-required');
});

test('ESLint: executable configs that reach jsdoc indirectly are unresolved and never executed', () => {
  const files = { 'eslint.config.js': 'import shared from "./tools/eslint-jsdoc-preset.js";\nthrow new Error("must not run");\nexport default [shared];\n' };
  assert.equal(statusFor(files, 'javascript', 'function'), 'unknown');
});

test('ESLint: comments inside config files are ignored', () => {
  const files = { 'eslint.config.js': '// "jsdoc/require-jsdoc": "error"\nexport default [];\n' };
  assert.equal(statusFor(files, 'javascript', 'function'), 'not-required');
});

test('Ruff: D1xx selection and per-file ignores', () => {
  const files = { 'pyproject.toml': '[tool.ruff.lint]\nselect = ["E", "D"]\n\n[tool.ruff.lint.per-file-ignores]\n"tests/**" = ["D"]\n' };
  assert.equal(statusFor(files, 'python', 'function', 'public', 'pkg/core.py'), 'required');
  assert.equal(statusFor(files, 'python', 'function', 'public', 'tests/test_core.py'), 'not-required');
  assert.equal(statusFor({ 'ruff.toml': 'line-length = 100\n' }, 'python', 'function'), 'not-required', 'D rules are not enabled by default');
  assert.equal(statusFor({ 'ruff.toml': '[lint]\nselect = ["D"]\nignore = ["D103"]\n' }, 'python', 'function'), 'not-required');
  assert.equal(statusFor({ 'ruff.toml': '[lint]\nselect = ["D"]\nignore = ["D103"]\n' }, 'python', 'class'), 'required');
  assert.equal(statusFor({ 'ruff.toml': 'extend = "../shared/ruff.toml"\n' }, 'python', 'function'), 'unknown');
});

test('Pylint: docstring checks are on by default and can be disabled', () => {
  assert.equal(statusFor({ '.pylintrc': '[MAIN]\njobs=2\n' }, 'python', 'module'), 'required');
  assert.equal(statusFor({ '.pylintrc': '[MESSAGES CONTROL]\ndisable=missing-module-docstring,C0116\n' }, 'python', 'module'), 'not-required');
  assert.equal(statusFor({ '.pylintrc': '[MESSAGES CONTROL]\ndisable=missing-module-docstring,C0116\n' }, 'python', 'function'), 'not-required');
  assert.equal(statusFor({ '.pylintrc': '[MAIN]\njobs=2\n' }, 'python', 'function', 'private'), 'not-required', 'no-docstring-rgx defaults to ^_');
});

test('pydocstyle configuration is recognized', () => {
  assert.equal(statusFor({ '.pydocstyle': '[pydocstyle]\nconvention = google\n' }, 'python', 'function'), 'required');
});

test('Checkstyle: MissingJavadoc modules with scope', () => {
  const xml = '<module name="Checker"><module name="TreeWalker"><module name="MissingJavadocType"/><!-- <module name="MissingJavadocMethod"/> --></module></module>';
  assert.equal(statusFor({ 'checkstyle.xml': xml }, 'java', 'class'), 'required');
  assert.equal(statusFor({ 'checkstyle.xml': xml }, 'java', 'method'), 'not-required', 'commented-out modules are ignored');
  assert.equal(statusFor({ 'checkstyle.xml': xml }, 'java', 'class', 'private'), 'not-required', 'scope defaults to public');
});

test('SwiftLint: missing_docs is opt-in', () => {
  assert.equal(statusFor({ '.swiftlint.yml': 'disabled_rules:\n  - trailing_whitespace\n' }, 'swift', 'function'), 'not-required');
  assert.equal(statusFor({ '.swiftlint.yml': 'opt_in_rules:\n  - missing_docs\n' }, 'swift', 'function'), 'required');
});

test('.NET: CS1591 requires GenerateDocumentationFile and honors NoWarn', () => {
  const generate = '<Project><PropertyGroup><GenerateDocumentationFile>true</GenerateDocumentationFile></PropertyGroup></Project>';
  assert.equal(statusFor({ 'App.csproj': generate }, 'csharp', 'class'), 'required');
  const noWarn = '<Project><PropertyGroup><GenerateDocumentationFile>true</GenerateDocumentationFile><NoWarn>$(NoWarn);CS1591</NoWarn></PropertyGroup></Project>';
  assert.equal(statusFor({ 'App.csproj': noWarn }, 'csharp', 'class'), 'not-required');
  assert.equal(statusFor({ 'App.csproj': '<Project></Project>' }, 'csharp', 'class'), 'not-required');
});

test('Dart: public_member_api_docs is opt-in', () => {
  assert.equal(statusFor({ 'analysis_options.yaml': 'include: package:lints/recommended.yaml\n' }, 'dart', 'function'), 'not-required');
  assert.equal(statusFor({ 'analysis_options.yaml': 'linter:\n  rules:\n    - public_member_api_docs\n' }, 'dart', 'function'), 'required');
});

test('Rust: missing_docs from Cargo lints or a crate attribute', () => {
  assert.equal(statusFor({ 'Cargo.toml': '[package]\nname = "a"\n\n[lints.rust]\nmissing_docs = "warn"\n' }, 'rust', 'function'), 'required');
  assert.equal(statusFor({ 'Cargo.toml': '[package]\nname = "a"\n', 'src/lib.rs': '#![deny(missing_docs)]\n' }, 'rust', 'function'), 'required');
  assert.equal(statusFor({ 'Cargo.toml': '[package]\nname = "a"\n' }, 'rust', 'function'), 'not-required', 'missing_docs is allow-by-default');
});

test('nested linter configuration makes the requirement unknown', () => {
  assert.equal(
    statusFor(
      { '.rubocop.yml': 'Style/Documentation:\n  Enabled: false\n', 'engines/billing/.rubocop.yml': 'AllCops: {}\n' },
      'ruby',
      'class',
      'public',
      'engines/billing/app/invoice.rb',
    ),
    'unknown',
  );
});

test('a resolver that throws becomes unknown rather than crashing', () => {
  const { requirements } = resolveRequirements((relative) => {
    if (relative === '.rubocop.yml') throw new Error('boom');
    return null;
  });
  assert.ok(requirements.some((entry) => entry.status === 'unknown'));
});

test('weakening is detected when a documentation rule is disabled, excluded, or narrowed', () => {
  const before = resolve({ '.rubocop.yml': 'AllCops: {}\n' });
  assert.equal(weakenedRequirements(before, resolve({ '.rubocop.yml': 'Style/Documentation:\n  Enabled: false\n' })).length > 0, true);
  assert.equal(weakenedRequirements(before, resolve({ '.rubocop.yml': 'Style/Documentation:\n  Exclude:\n    - "app/**"\n' })).length > 0, true);
  assert.equal(weakenedRequirements(before, resolve({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' })).length, 0);
});

test('.NET: the nearest project file applies to files in subdirectories', () => {
  const generate = '<Project><PropertyGroup><GenerateDocumentationFile>true</GenerateDocumentationFile></PropertyGroup></Project>';
  const files = {
    'src/Billing/Billing.csproj': generate,
    'src/Billing/Invoice.cs': 'public class Invoice {}\n',
    'tests/Billing.Tests/Billing.Tests.csproj': '<Project></Project>',
  };
  assert.equal(statusFor(files, 'csharp', 'class', 'public', 'src/Billing/Invoice.cs'), 'required');
  assert.equal(statusFor(files, 'csharp', 'class', 'public', 'tests/Billing.Tests/InvoiceTests.cs'), 'not-required');
});
