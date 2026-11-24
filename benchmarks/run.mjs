#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeChange } from '../src/classify/analyze.mjs';
import { defaultConfig } from '../src/config/config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOOK = path.join(ROOT, 'scripts', 'readability-hook.mjs');
const BUDGETS = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks', 'budgets.json'), 'utf8'));

const SAMPLES = {
  typescript: ['src/a.ts', '//', 'export const value = compute("a // b", /re\\/x/g, `t ${x}`); // eslint-disable-line no-console -- CLI output\n'],
  python: ['src/a.py', '#', 'value = compute("a # b", f"{x} # y")  # type: ignore[attr-defined]\n'],
  go: ['src/a.go', '//', 'var value = compute("a // b", `raw // c`) //nolint:gosec // vetted input\n'],
  rust: ['src/a.rs', '//', 'let value = compute(r#"a // b"#, \'/\'); /* block /* nested */ */\n'],
  ruby: ['src/a.rb', '#', 'value = compute("#{x} # y", %w[a#b]) # rubocop:disable Style/Foo -- legacy API\n'],
  java: ['src/A.java', '//', 'int value = compute("a // b", \'/\'); // NOPMD - generated constant\n'],
};

function percentile(values, fraction) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function timeAnalysis(fileName, marker, line, lines, iterations) {
  const source = `${line.repeat(lines)}${marker} loop over the values and add them\n`;
  const config = defaultConfig();
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    const result = analyzeChange({ filePath: `/bench/${fileName}`, projectRoot: '/bench', before: null, after: source, config, documentationRequirements: null });
    samples.push(performance.now() - started);
    if (result.status !== 'analyzed') throw new Error(`${fileName} was not analyzed: ${result.reason}`);
  }
  return { bytes: Buffer.byteLength(source), median: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

function timeHookProcess(iterations) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'readability bench '));
  fs.mkdirSync(path.join(root, '.git'));
  const payload = JSON.stringify({
    session_id: 'bench',
    cwd: root,
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: { file_path: path.join(root, 'a.ts'), content: 'export const a = 1; // set a to one\n' },
  });
  const env = { PATH: process.env.PATH, CLAUDE_PLUGIN_DATA: root, READABILITY_USER_CONFIG: path.join(root, 'none.json') };
  const samples = [];
  for (let iteration = 0; iteration < iterations; iteration++) {
    const started = performance.now();
    const result = spawnSync(process.execPath, [HOOK], { input: payload, env });
    samples.push(performance.now() - started);
    if (result.status !== 0) throw new Error(`hook exited with ${result.status}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  return { median: percentile(samples, 0.5), p95: percentile(samples, 0.95) };
}

const check = process.argv.includes('--check');
const iterations = check ? 5 : 15;
const rows = [];
for (const [language, [fileName, marker, line]] of Object.entries(SAMPLES)) {
  for (const lines of [100, 1000, 10000]) {
    const result = timeAnalysis(fileName, marker, line, lines, lines >= 10000 ? Math.max(3, Math.floor(iterations / 3)) : iterations);
    rows.push({ language, lines, ...result });
  }
}
const hook = timeHookProcess(iterations);

const format = (value) => value.toFixed(1).padStart(8);
const report = [
  `Node ${process.version}, ${os.platform()} ${os.arch()}, ${os.cpus()[0]?.model ?? 'unknown CPU'}`,
  '',
  '| Language | Lines | Size (KB) | Median (ms) | p95 (ms) |',
  '| :- | -: | -: | -: | -: |',
  ...rows.map((row) => `| ${row.language} | ${row.lines} | ${(row.bytes / 1024).toFixed(0)} | ${format(row.median)} | ${format(row.p95)} |`),
  '',
  `Whole hook process (spawn + config + discovery + analysis of a small Write): median ${hook.median.toFixed(1)} ms, p95 ${hook.p95.toFixed(1)} ms`,
].join('\n');
console.log(report);

if (process.argv.includes('--json')) {
  fs.mkdirSync(path.join(ROOT, 'benchmarks', 'output'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'benchmarks', 'output', 'results.json'), JSON.stringify({ node: process.version, platform: os.platform(), rows, hook }, null, 2));
}

if (check) {
  const failures = [];
  for (const row of rows.filter((entry) => entry.lines === 10000)) {
    if (row.median > BUDGETS.analysis10kLinesMedianMs) failures.push(`${row.language} 10k lines: ${row.median.toFixed(1)}ms > ${BUDGETS.analysis10kLinesMedianMs}ms`);
  }
  if (hook.median > BUDGETS.hookProcessMedianMs) failures.push(`hook process: ${hook.median.toFixed(1)}ms > ${BUDGETS.hookProcessMedianMs}ms`);
  if (failures.length > 0) {
    console.error(`\nPerformance budget exceeded:\n${failures.join('\n')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll performance budgets met.');
  }
}
