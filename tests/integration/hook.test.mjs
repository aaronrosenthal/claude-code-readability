import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { editPayload, runHook, temporaryProject, writePayload } from '../helpers.mjs';

// Most tests exercise enforcement, so the isolated user config selects balanced mode. Project configs still override it.
function isolatedEnv(root, extra = {}, { userConfig = { mode: 'balanced' } } = {}) {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'readability data '));
  const userConfigPath = path.join(data, 'user.json');
  if (userConfig) fs.writeFileSync(userConfigPath, JSON.stringify(userConfig));
  return { CLAUDE_PROJECT_DIR: root, CLAUDE_PLUGIN_DATA: data, READABILITY_USER_CONFIG: userConfigPath, ...extra };
}

const NARRATION = 'export function total(items: number[]): number {\n  // loop over the numbers and add them up\n  return items.reduce((sum, value) => sum + value, 0);\n}\n';
const CLEAN = 'export function total(items: number[]): number {\n  return items.reduce((sum, value) => sum + value, 0);\n}\n';

test('Write: denies a new narrating comment with file, line, comment, and reason', async () => {
  const root = temporaryProject();
  const file = path.join(root, 'src', 'total.ts');
  const result = await runHook(writePayload(file, NARRATION, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.code, 0);
  assert.equal(result.decision, 'deny');
  const reason = result.output.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /src\/total\.ts:2/);
  assert.match(reason, /loop over the numbers/);
  assert.match(reason, /restates|explanatory/);
});

test('Write: allows clean code with no output', async () => {
  const root = temporaryProject();
  const result = await runHook(writePayload(path.join(root, 'total.ts'), CLEAN, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('Write: existing comments in an overwritten file are not reported', async () => {
  const root = temporaryProject({ 'total.ts': NARRATION });
  const result = await runHook(writePayload(path.join(root, 'total.ts'), NARRATION.replace('0);', '0) * 1;'), { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.stdout, '');
});

test('Edit: only the replaced region is new', async () => {
  const root = temporaryProject({ 'total.ts': CLEAN });
  const file = path.join(root, 'total.ts');
  const denied = await runHook(editPayload(file, '  return items', '  // add them all up\n  return items', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(denied.decision, 'deny');
  assert.match(denied.output.hookSpecificOutput.permissionDecisionReason, /total\.ts:2/);
  const allowed = await runHook(editPayload(file, 'sum + value', 'value + sum', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(allowed.stdout, '');
});

test('Edit: a missing file or an old_string that does not match fails open', async () => {
  const root = temporaryProject({ 'a.ts': CLEAN });
  const missing = await runHook(editPayload(path.join(root, 'nope.ts'), 'x', '// narrate\nx', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(missing.stdout, '');
  const mismatch = await runHook(editPayload(path.join(root, 'a.ts'), 'not present', '// narrate', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(mismatch.stdout, '');
});

test('Edit: replace_all applies to every occurrence', async () => {
  const root = temporaryProject({ 'a.py': 'x = 1\ny = 1\n' });
  const result = await runHook(editPayload(path.join(root, 'a.py'), '= 1', '= 1  # set the value to one', { cwd: root, replace_all: true }), { env: isolatedEnv(root) });
  assert.equal(result.decision, 'deny');
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /a\.py:1/);
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /a\.py:2/);
});

test('NotebookEdit: code cells are checked, markdown cells are not', async () => {
  const notebook = {
    cells: [
      { cell_type: 'code', id: 'abc', metadata: {}, source: ['x = 1\n'], outputs: [], execution_count: null },
      { cell_type: 'markdown', id: 'md1', metadata: {}, source: ['# Title\n'] },
    ],
    metadata: { kernelspec: { language: 'python', name: 'python3', display_name: 'Python 3' } },
    nbformat: 4,
    nbformat_minor: 5,
  };
  const root = temporaryProject({ 'analysis.ipynb': JSON.stringify(notebook) });
  const base = { session_id: 's', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'NotebookEdit' };
  const notebookPath = path.join(root, 'analysis.ipynb');
  const code = await runHook(
    { ...base, tool_input: { notebook_path: notebookPath, cell_id: 'abc', new_source: 'x = 1  # assign one to x\n', cell_type: 'code', edit_mode: 'replace' } },
    { env: isolatedEnv(root) },
  );
  assert.equal(code.decision, 'deny');
  assert.match(code.output.hookSpecificOutput.permissionDecisionReason, /analysis\.ipynb/);
  const markdown = await runHook(
    { ...base, tool_input: { notebook_path: notebookPath, cell_id: 'md1', new_source: '# loop over things', cell_type: 'markdown', edit_mode: 'replace' } },
    { env: isolatedEnv(root) },
  );
  assert.equal(markdown.stdout, '');
  const inserted = await runHook(
    { ...base, tool_input: { notebook_path: notebookPath, cell_id: 'abc', new_source: '# now print the value\nprint(x)\n', cell_type: 'code', edit_mode: 'insert' } },
    { env: isolatedEnv(root) },
  );
  assert.equal(inserted.decision, 'deny');
});

test('Bash: heredoc writes with literal paths are checked, others are not', async () => {
  const root = temporaryProject();
  const base = { session_id: 's', cwd: root, hook_event_name: 'PreToolUse', tool_name: 'Bash' };
  const heredoc = `cat > src/total.ts <<'EOF'\n${NARRATION}EOF`;
  const denied = await runHook({ ...base, tool_input: { command: heredoc } }, { env: isolatedEnv(root) });
  assert.equal(denied.decision, 'deny');
  const quotedPath = `cat > "my dir/total.ts" <<'EOF'\n${NARRATION}EOF`;
  assert.equal((await runHook({ ...base, tool_input: { command: quotedPath } }, { env: isolatedEnv(root) })).decision, 'deny');
  const variable = `cat > "$TARGET" <<'EOF'\n${NARRATION}EOF`;
  assert.equal((await runHook({ ...base, tool_input: { command: variable } }, { env: isolatedEnv(root) })).stdout, '');
  const plain = await runHook({ ...base, tool_input: { command: 'npm test # run the tests' } }, { env: isolatedEnv(root) });
  assert.equal(plain.stdout, '');
});

test('malformed payloads and unexpected input fail open', async () => {
  const root = temporaryProject();
  const env = isolatedEnv(root);
  for (const rawInput of [
    '',
    'not json',
    '[]',
    'null',
    '{}',
    '{"tool_name":"Write"}',
    '{"tool_name":"Write","tool_input":{"file_path":42}}',
    '{"tool_name":"Read","tool_input":{"file_path":"/etc/passwd"}}',
  ]) {
    const result = await runHook(null, { env, rawInput });
    assert.equal(result.code, 0, rawInput);
    assert.equal(result.stdout, '', rawInput);
  }
});

test('unsupported and unparseable files fail open', async () => {
  const root = temporaryProject();
  const env = isolatedEnv(root);
  assert.equal((await runHook(writePayload(path.join(root, 'notes.md'), '<!-- loop over items -->\n', { cwd: root }), { env })).stdout, '');
  assert.equal((await runHook(writePayload(path.join(root, 'a.ts'), '// loop over items\nconst s = `open\n', { cwd: root }), { env })).stdout, '');
});

test('paths with spaces and unicode work', async () => {
  const root = temporaryProject();
  const file = path.join(root, 'dir with spaces', 'café', 'total.ts');
  const result = await runHook(writePayload(file, NARRATION, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.decision, 'deny');
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /dir with spaces\/café\/total\.ts:2/);
});

test('minimal feedback lists locations without guidance', async () => {
  const root = temporaryProject();
  const result = await runHook(writePayload(path.join(root, 'total.ts'), NARRATION, { cwd: root }), { env: isolatedEnv(root), args: ['--feedback=minimal'] });
  assert.equal(result.decision, 'deny');
  const reason = result.output.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason, /total\.ts:2/);
  assert.doesNotMatch(reason, /exception tag|SAFETY/);
});

test('advisory mode adds context instead of blocking', async () => {
  const root = temporaryProject({ '.readability.json': JSON.stringify({ mode: 'advisory' }) });
  const result = await runHook(writePayload(path.join(root, 'total.ts'), NARRATION, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.decision, null);
  assert.match(result.output.hookSpecificOutput.additionalContext, /total\.ts:2/);
});

test('the default mode warns about comments instead of blocking', async () => {
  const root = temporaryProject();
  const result = await runHook(writePayload(path.join(root, 'total.ts'), NARRATION, { cwd: root }), { env: isolatedEnv(root, {}, { userConfig: null }) });
  assert.equal(result.decision, null);
  assert.match(result.output.hookSpecificOutput.additionalContext, /readability \(advisory\)/);
  assert.match(result.output.hookSpecificOutput.additionalContext, /Keep any comment that records a reason/);
});

test('the default mode still asks before readability config edits and weakened documentation rules', async () => {
  const root = temporaryProject({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' });
  const env = isolatedEnv(root, {}, { userConfig: null });
  const configEdit = await runHook(writePayload(path.join(root, '.readability.json'), '{"mode":"off"}', { cwd: root }), { env });
  assert.equal(configEdit.decision, 'ask');
  const weakened = await runHook(writePayload(path.join(root, '.rubocop.yml'), 'AllCops:\n  NewCops: enable\nStyle/Documentation:\n  Enabled: false\n', { cwd: root }), { env });
  assert.equal(weakened.decision, 'ask');
});

test('repeated identical rejections are released to avoid a loop', async () => {
  const root = temporaryProject({ '.readability.json': JSON.stringify({ retryLimit: 2 }) });
  const env = isolatedEnv(root);
  const payload = writePayload(path.join(root, 'total.ts'), NARRATION, { cwd: root, session_id: 'loop-session' });
  const decisions = [];
  for (let attempt = 0; attempt < 4; attempt++) decisions.push((await runHook(payload, { env })).decision);
  assert.deepEqual(decisions.slice(0, 2), ['deny', 'deny']);
  assert.equal(decisions[2], null, 'released on the attempt after the limit');
  const otherSession = await runHook({ ...payload, session_id: 'fresh-session' }, { env });
  assert.equal(otherSession.decision, 'deny', 'counters are per session');
});

test('edits to the readability configuration ask for confirmation', async () => {
  const root = temporaryProject({ '.readability.json': '{"mode":"strict"}' });
  const result = await runHook(writePayload(path.join(root, '.readability.json'), '{"mode":"off"}', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.decision, 'ask');
});

test('weakening a linter documentation requirement asks for confirmation', async () => {
  const root = temporaryProject({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' });
  const file = path.join(root, '.rubocop.yml');
  const weakened = await runHook(writePayload(file, 'AllCops:\n  NewCops: enable\nStyle/Documentation:\n  Enabled: false\n', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(weakened.decision, 'ask');
  assert.match(weakened.output.hookSpecificOutput.permissionDecisionReason, /Style\/Documentation/);
  const harmless = await runHook(writePayload(file, 'AllCops:\n  NewCops: enable\n  TargetRubyVersion: 3.3\n', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(harmless.stdout, '');
});

test('project-required documentation is allowed end to end', async () => {
  const root = temporaryProject({ '.rubocop.yml': 'AllCops:\n  NewCops: enable\n' });
  const source = '# Invoice\nclass Invoice\nend\n';
  const result = await runHook(writePayload(path.join(root, 'app', 'invoice.rb'), source, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.stdout, '');
  const unrequired = temporaryProject();
  const denied = await runHook(writePayload(path.join(unrequired, 'app', 'invoice.rb'), source, { cwd: unrequired }), { env: isolatedEnv(unrequired) });
  assert.equal(denied.decision, 'deny');
});

test('concurrent invocations do not interfere', async () => {
  const root = temporaryProject();
  const env = isolatedEnv(root);
  const runs = Array.from({ length: 16 }, (_, index) =>
    runHook(writePayload(path.join(root, `file${index}.ts`), index % 2 ? NARRATION : CLEAN, { cwd: root, session_id: 'parallel' }), { env }),
  );
  const results = await Promise.all(runs);
  for (const [index, result] of results.entries()) assert.equal(result.decision, index % 2 ? 'deny' : null, `file${index}`);
});

test('the hook never modifies files', async () => {
  const root = temporaryProject({ 'total.ts': CLEAN });
  const file = path.join(root, 'total.ts');
  await runHook(writePayload(file, NARRATION, { cwd: root }), { env: isolatedEnv(root) });
  await runHook(editPayload(file, '  return', '  // narrate\n  return', { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(fs.readFileSync(file, 'utf8'), CLEAN);
});

test('large files are handled within the timeout budget', async () => {
  const root = temporaryProject();
  const line = 'export const value = compute("a // b", /re\\/x/g, `t ${x}`);\n';
  const source = `${line.repeat(30000)}// loop over the values\n`;
  const started = performance.now();
  const result = await runHook(writePayload(path.join(root, 'big.ts'), source, { cwd: root }), { env: isolatedEnv(root) });
  const elapsed = performance.now() - started;
  assert.equal(result.decision, 'deny');
  assert.ok(elapsed < 5000, `took ${elapsed}ms`);
});

test('Windows-style paths in payloads are handled', async () => {
  const result = await runHook(writePayload('C:\\project\\src\\total.ts', NARRATION, { cwd: 'C:\\project' }), {
    env: { CLAUDE_PLUGIN_DATA: fs.mkdtempSync(path.join(os.tmpdir(), 'rd ')), READABILITY_USER_CONFIG: '/nonexistent', READABILITY_MODE: 'balanced' },
  });
  assert.equal(result.code, 0);
  if (process.platform === 'win32') assert.equal(result.decision, 'deny');
});

test('runtime failures inside the hook fail open with exit code 0', async () => {
  const { Readable, Writable } = await import('node:stream');
  const { main } = await import('../../src/hook/run.mjs');
  const failing = new Readable({
    read() {
      this.destroy(new Error('simulated stdin failure'));
    },
  });
  let written = '';
  const sink = new Writable({
    write(chunk, _encoding, callback) {
      written += chunk;
      callback();
    },
  });
  const code = await main({ stdin: failing, stdout: sink, stderr: sink, env: { READABILITY_DEBUG: '1' } });
  assert.equal(code, 0);
  assert.match(written, /internal error, allowing the edit/);
});

test('a readability configuration that is not a file is ignored with a warning', async () => {
  const root = temporaryProject();
  fs.mkdirSync(path.join(root, '.readability.json'));
  const result = await runHook(writePayload(path.join(root, 'total.ts'), NARRATION, { cwd: root }), { env: isolatedEnv(root, { READABILITY_DEBUG: '1' }) });
  assert.equal(result.code, 0);
  assert.equal(result.decision, 'deny');
  assert.match(result.stderr, /readability\.json/);
});

test('weakening a nested project file documentation requirement asks for confirmation', async () => {
  const generate = '<Project><PropertyGroup><GenerateDocumentationFile>true</GenerateDocumentationFile></PropertyGroup></Project>';
  const root = temporaryProject({ 'src/Billing/Billing.csproj': generate });
  const weakened = generate.replace('</PropertyGroup>', '<NoWarn>CS1591</NoWarn></PropertyGroup>');
  const result = await runHook(writePayload(path.join(root, 'src/Billing/Billing.csproj'), weakened, { cwd: root }), { env: isolatedEnv(root) });
  assert.equal(result.decision, 'ask');
});
