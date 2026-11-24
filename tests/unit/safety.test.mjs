import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from '../helpers.mjs';

const RUNTIME_DIRECTORIES = ['src', 'scripts'];
const FORBIDDEN =
  /\bfrom\s+['"](?:node:)?(?:child_process|http|https|http2|net|tls|dgram|dns|worker_threads|vm)['"]|\bimport\(\s*['"](?:node:)?(?:child_process|http|https|net)['"]|\bfetch\(|\beval\(|new Function\(/;

function runtimeFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'dev' ? [] : runtimeFiles(full);
    return entry.name.endsWith('.mjs') ? [full] : [];
  });
}

test('hook runtime code has no network, process-spawning, or dynamic code execution', () => {
  for (const directory of RUNTIME_DIRECTORIES) {
    for (const file of runtimeFiles(path.join(REPO_ROOT, directory))) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), FORBIDDEN, path.relative(REPO_ROOT, file));
    }
  }
});

test('the hook is registered in exec form without a shell', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  for (const group of hooks.hooks.PreToolUse) {
    for (const hook of group.hooks) {
      assert.equal(hook.command, 'node');
      assert.ok(Array.isArray(hook.args));
      assert.ok(hook.timeout <= 30);
    }
  }
});
