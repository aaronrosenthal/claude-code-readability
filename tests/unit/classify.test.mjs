import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyze, configWith, reasons, requiredFor, unknownRequirements } from '../helpers.mjs';

test('rejects a comment that narrates the code', () => {
  const result = analyze(
    'a.ts',
    'export function total(items: Item[]) {\n  // loop over the items and add up the prices\n  return items.reduce((sum, item) => sum + item.price, 0);\n}\n',
  );
  assert.equal(result.findings.length, 1);
  assert.equal(result.findings[0].line, 2);
  assert.equal(result.findings[0].category, 'unnecessary');
});

test('rejection reasons distinguish common smells', () => {
  assert.deepEqual(reasons(analyze('a.ts', 'let x = 1;\n// increment x\nx++;\n')), ['restates-code']);
  assert.deepEqual(reasons(analyze('a.py', 'd = 30  # days until the invoice expires\n')), ['explains-name']);
  assert.deepEqual(reasons(analyze('a.py', 'if status == 3:  # 3 means refunded\n    pass\n')), ['explains-magic-value']);
  assert.deepEqual(reasons(analyze('a.ts', '// ---------------------------\nconst a = 1;\n')), ['decorative-separator']);
  assert.deepEqual(reasons(analyze('a.ts', '// const legacy = computeOld(a, b);\nconst a = 1;\n')), ['commented-out-code']);
  assert.deepEqual(reasons(analyze('a.py', '# Step 1: load the configuration file\nconfig = load()\n')), ['numbered-step']);
});

test('TODO, FIXME, HACK and NOTE do not bypass the check', () => {
  for (const tag of ['TODO', 'FIXME', 'HACK', 'NOTE', 'XXX']) {
    const result = analyze('a.ts', `// ${tag}: clean this up later\nconst a = 1;\n`);
    assert.equal(result.findings.length, 1, tag);
  }
});

test('exception tags admit substantive comments only', () => {
  const allowed = analyze('a.rs', 'fn f() {\n    // SAFETY: the pointer is non-null and aligned because it came from Box::into_raw\n    unsafe { g() }\n}\n');
  assert.equal(allowed.findings.length, 0);
  const thin = analyze('a.rs', 'fn f() {\n    // SAFETY: fine\n    unsafe { g() }\n}\n');
  assert.deepEqual(reasons(thin), ['thin-exception']);
  const custom = configWith({ exceptions: { ...configWith().exceptions, tags: ['WHY'] } });
  assert.equal(analyze('a.ts', '// WHY: the payment provider rejects amounts with more than two decimals\nconst a = 1;\n', { config: custom }).findings.length, 0);
  assert.equal(analyze('a.ts', '// SAFETY: the payment provider rejects amounts with more than two decimals\nconst a = 1;\n', { config: custom }).findings.length, 1);
});

test('external references are allowed in balanced mode but not strict mode', () => {
  const source = 'const RETRIES = 5;\n// Works around https://github.com/nodejs/node/issues/12345 in the stream reader\nread();\n';
  assert.equal(analyze('a.ts', source).findings.length, 0);
  assert.equal(analyze('a.ts', source, { config: configWith({ mode: 'strict' }) }).findings.length, 1);
});

test('license headers and legal comments are allowed', () => {
  assert.equal(analyze('a.ts', '// Copyright 2026 Example Corp.\n// Licensed under the Apache License, Version 2.0.\nexport const a = 1;\n').findings.length, 0);
  assert.equal(analyze('a.js', 'const a = 1;\n/*! jQuery v3.7.1 | (c) OpenJS Foundation */\n').findings.length, 0);
  assert.equal(analyze('a.ts', 'export const a = 1;\n// Copyright 2026 Example Corp.\n').findings.length, 1, 'only in the header');
});

test('only newly introduced comments are analyzed', () => {
  const before = 'function f() {\n  // legacy explanation that was already here\n  return 1;\n}\n';
  const after = 'function f() {\n  // legacy explanation that was already here\n  return 2;\n}\n';
  assert.equal(analyze('a.js', after, { before }).findings.length, 0);
  const moved = 'function g() {}\nfunction f() {\n  // legacy explanation that was already here\n  return 1;\n}\n';
  assert.equal(analyze('a.js', moved, { before }).findings.length, 0, 'moving an existing comment is not new');
  const duplicated = `${before}function h() {\n  // legacy explanation that was already here\n  return 1;\n}\n`;
  assert.equal(analyze('a.js', duplicated, { before }).findings.length, 1, 'a second copy is new');
});

test('minor edits to an existing comment are allowed, rewrites are not', () => {
  const before = '// Retries are capped because the upstream rate limiter bans the client\nconst RETRIES = 3;\n';
  const tweak = '// Retries are capped because the upstream rate limiter temporarily bans the client\nconst RETRIES = 3;\n';
  assert.equal(analyze('a.ts', tweak, { before }).findings.length, 0);
  const extended =
    '// Retries are capped because the upstream rate limiter bans the client\n// and then we loop over every request and add each one to the queue\nconst RETRIES = 3;\n';
  assert.equal(analyze('a.ts', extended, { before }).findings.length, 1);
});

test('comment-like text inside strings is never flagged', () => {
  const result = analyze('a.ts', 'const help = "// run this to loop over the items";\nconst url = "https://example.com/#anchor";\n');
  assert.equal(result.findings.length, 0);
});

test('multiple comments are each reported with their line', () => {
  const result = analyze('a.py', 'x = load()  # load the data\n\n# now we sort it by the timestamp\nx.sort()\n');
  assert.deepEqual(
    result.findings.map((finding) => finding.line),
    [1, 3],
  );
});

test('Python: bare string statements used as comments are rejected, docstrings are classified as documentation', () => {
  assert.deepEqual(reasons(analyze('a.py', 'def f():\n    x = 1\n    """now we return the value"""\n    return x\n')), ['bare-string-comment']);
  const doc = analyze(
    'a.py',
    'def parse_invoice(raw: bytes) -> Invoice:\n    """Parse an invoice. Raises InvoiceError when the checksum does not match the payload."""\n    return Invoice()\n',
  );
  assert.equal(doc.findings.length, 0, 'public non-restating docstrings are allowed in balanced mode');
});

test('documentation that restates the declaration is rejected', () => {
  const result = analyze('a.ts', '/** Gets the user name. */\nexport function getUserName(): string { return ""; }\n');
  assert.deepEqual(reasons(result), ['restates-declaration']);
});

test('documentation for private helpers is not required in balanced mode', () => {
  const result = analyze('a.py', 'def _helper(value):\n    """Doubles the incoming value and hands it back to the caller."""\n    return value * 2\n');
  assert.deepEqual(reasons(result), ['documentation-not-required']);
});

test('project-required documentation wins over the comment restrictions', () => {
  const ruby = 'class Invoice\nend\n';
  const documented = '# Invoice\nclass Invoice\nend\n';
  assert.equal(analyze('a.rb', documented).findings.length, 1, 'restating doc without requirement');
  assert.equal(analyze('a.rb', documented, { requirements: requiredFor('ruby', ['class'], 'RuboCop Style/Documentation') }).findings.length, 0);
  assert.equal(analyze('a.rb', ruby).findings.length, 0);
});

test('unresolved documentation requirements fall back to allowing documentation', () => {
  const result = analyze('a.ts', '/** Gets the user name. */\nexport function getUserName(): string { return ""; }\n', { requirements: unknownRequirements() });
  assert.equal(result.findings.length, 0);
});

test('documentation policy overrides', () => {
  const source = 'def _helper(value):\n    """Doubles the incoming value and hands it back to the caller."""\n    return value * 2\n';
  const allow = configWith({ documentation: { ...configWith().documentation, function: 'allow' } });
  assert.equal(analyze('a.py', source, { config: allow }).findings.length, 0);
  const restrict = configWith({ documentation: { ...configWith().documentation, function: 'restrict' } });
  const publicDoc = 'def parse_invoice(raw):\n    """Parse an invoice. Raises InvoiceError when the checksum does not match."""\n    return raw\n';
  assert.equal(analyze('a.py', publicDoc, { config: restrict }).findings.length, 1);
});

test('JSDoc type annotations are machine-consumed', () => {
  assert.equal(analyze('a.js', '/** @type {import("./config").Config} */\nconst config = load();\n').findings.length, 0);
  assert.equal(analyze('a.js', '/** @typedef {{ id: string }} User */\n').findings.length, 0);
});

test('suppressions need a justification in balanced mode', () => {
  assert.deepEqual(reasons(analyze('a.ts', '// eslint-disable-next-line no-console\nconsole.log(1);\n')), ['unjustified-suppression']);
  assert.equal(analyze('a.ts', '// eslint-disable-next-line no-console -- the CLI prints its result\nconsole.log(1);\n').findings.length, 0);
  assert.equal(
    analyze('a.py', '# The C extension has no stubs, see the vendored README\nimport fastlib  # type: ignore[import-untyped]\n').findings.length,
    0,
    'justification on the line above',
  );
  assert.equal(analyze('a.go', 'package a\n\nvar x = 1 //nolint:gochecknoglobals // configuration singleton for the CLI\n').findings.length, 0);
});

test('blanket and file-wide suppressions are rejected by default', () => {
  assert.deepEqual(reasons(analyze('a.ts', '// eslint-disable-next-line -- this line is noisy\nconsole.log(1);\n')), ['blanket-suppression']);
  assert.deepEqual(reasons(analyze('a.py', 'import os  # noqa\n')), ['blanket-suppression']);
  assert.deepEqual(reasons(analyze('a.ts', '/* eslint-disable no-console -- the whole CLI prints */\nconsole.log(1);\n')), ['file-wide-suppression']);
  const region = '/* eslint-disable no-console -- the banner prints a table */\nconsole.log(1);\n/* eslint-enable no-console */\n';
  assert.equal(analyze('a.ts', region).findings.length, 0, 'a closed region is not file-wide');
});

test('strict mode denies new suppressions unless allowlisted', () => {
  const source = '// eslint-disable-next-line no-console -- the CLI prints its result\nconsole.log(1);\n';
  const strict = configWith({ mode: 'strict' });
  assert.deepEqual(reasons(analyze('a.ts', source, { config: strict })), ['suppression-not-authorized']);
  const allowlisted = configWith({ mode: 'strict', suppressions: { ...configWith().suppressions, allow: { eslint: ['no-console'] } } });
  assert.equal(analyze('a.ts', source, { config: allowlisted }).findings.length, 0);
});

test('deny-listed suppressions are always rejected', () => {
  const config = configWith({ suppressions: { ...configWith().suppressions, new: 'allow', deny: { typescript: ['*'] } } });
  assert.deepEqual(reasons(analyze('a.ts', '// @ts-ignore\nconst x: number = "a";\n', { config })), ['suppression-denied']);
  assert.equal(analyze('a.ts', '// eslint-disable-next-line no-console\nconsole.log(1);\n', { config }).findings.length, 0);
});

test('suppressing a documentation rule is circumvention', () => {
  const cases = [
    ['a.rb', 'class Invoice # rubocop:disable Style/Documentation -- not needed\nend\n'],
    ['a.py', 'def parse(raw):  # noqa: D103\n    return raw\n'],
    ['a.py', '# pylint: disable=missing-function-docstring\n'],
    ['a.ts', '// eslint-disable-next-line jsdoc/require-jsdoc -- internal\nexport function f() {}\n'],
    ['a.swift', '// swiftlint:disable:next missing_docs\npublic func f() {}\n'],
    ['a.dart', '// ignore: public_member_api_docs\nvoid f() {}\n'],
  ];
  for (const [file, source] of cases) assert.deepEqual(reasons(analyze(file, source)), ['documentation-circumvention'], file);
});

test('documentation suppressions written as attributes and pragmas are circumvention', () => {
  const cases = [
    ['lib.rs', '#[allow(missing_docs)]\npub fn f() {}\n'],
    ['A.cs', '#pragma warning disable CS1591\npublic class A {}\n'],
    ['A.java', '@SuppressWarnings("MissingJavadocMethod")\npublic void f() {}\n'],
    ['A.kt', '@Suppress("UndocumentedPublicClass")\nclass A\n'],
  ];
  for (const [file, source] of cases) assert.ok(reasons(analyze(file, source)).includes('documentation-circumvention'), file);
  assert.equal(
    analyze('lib.rs', '#[allow(missing_docs)]\npub fn f() {}\n', { before: '#[allow(missing_docs)]\npub fn f() {}\n' }).findings.length,
    0,
    'existing constructs are preserved',
  );
});

test('existing suppressions are preserved but cannot be broadened', () => {
  const before = 'console.log(1); // eslint-disable-line no-console -- CLI output\n';
  assert.equal(analyze('a.js', before, { before }).findings.length, 0);
  const broadened = 'console.log(1); // eslint-disable-line no-console, no-undef -- CLI output\n';
  assert.deepEqual(reasons(analyze('a.js', broadened, { before })), ['broadens-suppression']);
  const toFile = '/* eslint-disable no-console -- CLI output */\nconsole.log(1);\n';
  assert.ok(reasons(analyze('a.js', toFile, { before })).length > 0);
});

test('inline ESLint config that turns a rule off counts as a suppression', () => {
  assert.ok(reasons(analyze('a.js', '/* eslint jsdoc/require-jsdoc: "off" */\nexport function f() {}\n')).includes('documentation-circumvention'));
});

test('advisory mode reports without blocking and off mode skips', () => {
  const source = '// loop over items\nfor (const item of items) use(item);\n';
  const advisory = analyze('a.js', source, { config: configWith({ mode: 'advisory' }) });
  assert.equal(advisory.mode, 'advisory');
  assert.equal(advisory.findings.length, 1);
  assert.equal(analyze('a.js', source, { config: configWith({ mode: 'off' }) }).status, 'skipped');
});

test('language overrides change the mode for one language', () => {
  const config = configWith({ languages: { python: { mode: 'off' } } });
  assert.equal(analyze('a.py', '# load the data\nx = load()\n', { config }).status, 'skipped');
  assert.equal(analyze('a.ts', '// load the data\nconst x = load();\n', { config }).status, 'analyzed');
});

test('unsupported, excluded, generated, and unparseable files fail open', () => {
  assert.equal(analyze('README.md', '<!-- loop over items -->\n').status, 'skipped');
  assert.equal(analyze('node_modules/pkg/index.js', '// loop over items\n').status, 'skipped');
  assert.equal(analyze('vendor/lib.go', '// loop over items\n').status, 'skipped');
  assert.equal(analyze('api.pb.go', '// Code generated by protoc-gen-go. DO NOT EDIT.\n\npackage api\n// loop over items\n').status, 'skipped');
  assert.equal(analyze('a.js', '// loop over items\nconst s = `unterminated\n').status, 'skipped');
  const excluded = configWith({ exclude: ['scripts/**'] });
  assert.equal(analyze('scripts/tool.py', '# loop over items\n', { config: excluded }).status, 'skipped');
});

test('a full write and the equivalent partial edit produce the same findings', () => {
  const before = 'export function f() {\n  return 1;\n}\n';
  const after = 'export function f() {\n  // return one to the caller\n  return 1;\n}\n';
  assert.deepEqual(reasons(analyze('a.ts', after, { before })), reasons(analyze('a.ts', after)));
});

test('embedded languages are analyzed with their own rules', () => {
  const vue = '<template><div><!-- show the user name here --></div></template>\n<script setup lang="ts">\n// loop over users\nfor (const u of users) show(u);\n</script>\n';
  assert.equal(analyze('a.vue', vue).findings.length, 2);
});

test('Markdown fences and unsupported files are not analyzed', () => {
  assert.equal(analyze('notes.md', '```js\n// loop over items\n```\n').status, 'skipped');
  assert.equal(analyze('data.json', '{"a": 1}\n').status, 'skipped');
});

test('hash-comment segments are classified separately', () => {
  const result = analyze('a.py', 'import os  # noqa: F401 # re-exported for the plugin loader API\n');
  assert.equal(result.findings.length, 0);
});

test('CRLF sources report correct lines', () => {
  const result = analyze('a.ts', 'const a = 1;\r\n// add one to a\r\nconst b = a + 1;\r\n');
  assert.deepEqual(
    result.findings.map((finding) => finding.line),
    [2],
  );
});

test('Python attribute docstrings are documentation only at module and class scope', () => {
  const attribute = analyze('a.py', 'class Settings:\n    timeout = 30\n    """Seconds before the upstream gateway drops an idle connection."""\n');
  assert.equal(attribute.findings.length, 0);
  const inFunction = analyze('a.py', 'def f():\n    x = 1\n    """now we return the value"""\n    return x\n');
  assert.deepEqual(reasons(inFunction), ['bare-string-comment']);
});
