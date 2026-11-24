import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeChange } from '../src/classify/analyze.mjs';
import { defaultConfig } from '../src/config/config.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HOOK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'readability-hook.mjs');

export function configWith(overrides = {}) {
  const config = defaultConfig();
  for (const [key, value] of Object.entries(overrides)) {
    config[key] = value && typeof value === 'object' && !Array.isArray(value) && typeof config[key] === 'object' && key !== 'languages' ? { ...config[key], ...value } : value;
  }
  return config;
}

export function analyze(fileName, after, { before = null, config = configWith(), requirements = null } = {}) {
  return analyzeChange({ filePath: `/project/${fileName}`, projectRoot: '/project', before, after, config, documentationRequirements: requirements });
}

export function reasons(result) {
  return result.findings.map((finding) => finding.reasonCode);
}

export function requiredFor(family, kinds, source = 'test linter') {
  return {
    requirementFor(requestedFamily, kind) {
      return requestedFamily === family && kinds.includes(kind) ? { status: 'required', source } : { status: 'not-required' };
    },
  };
}

export function unknownRequirements(source = 'unresolved config') {
  return { requirementFor: () => ({ status: 'unknown', source }) };
}

export function temporaryProject(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readability test '));
  fs.mkdirSync(path.join(root, '.git'));
  for (const [relative, content] of Object.entries(files)) {
    const full = path.join(root, relative);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

export function runHook(payload, { env = {}, args = [], rawInput = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [HOOK_SCRIPT, ...args], {
      env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (code) => {
      let output = null;
      if (stdout.trim()) output = JSON.parse(stdout);
      resolve({ code, stdout, stderr, output, decision: output?.hookSpecificOutput?.permissionDecision ?? null });
    });
    child.stdin.end(rawInput ?? JSON.stringify(payload));
  });
}

export function writePayload(filePath, content, extra = {}) {
  return {
    session_id: extra.session_id ?? `session-${Math.random().toString(36).slice(2)}`,
    transcript_path: '/tmp/transcript.jsonl',
    cwd: extra.cwd ?? path.dirname(filePath),
    permission_mode: 'default',
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: filePath, content },
    tool_use_id: 'toolu_test',
  };
}

export function editPayload(filePath, oldString, newString, extra = {}) {
  return {
    ...writePayload(filePath, '', extra),
    tool_name: 'Edit',
    tool_input: { file_path: filePath, old_string: oldString, new_string: newString, replace_all: extra.replace_all ?? false },
  };
}
