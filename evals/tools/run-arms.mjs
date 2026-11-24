#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ARMS, buildVariants } from './build-variants.mjs';
import { EVALS_ROOT, findCases, loadCase, walkFiles } from './lib.mjs';

const USAGE = `Usage: node evals/tools/run-arms.mjs [options]

Runs the same cases under four arms with identical settings:
  A  no plugin (the native without-arm of the D run)
  B  readability skill only
  C  hook with minimal feedback, no skill
  D  full plugin

Options:
  --tag <tag>            Case tag to run (default: smoke)
  --case <substring>     Only cases whose name contains this (repeatable)
  --arms <list>          Comma-separated subset of A,B,C,D (default: A,B,C,D)
  --runs <n>             Runs per case per arm (default: 2)
  --model <id>           Model under test (default: claude-sonnet-5-5)
  --judge-model <id>     Model for llm graders (default: claude-haiku-5-5)
  --budget <usd>         Total list-price ceiling across all arms (default: 10)
  --concurrency <n>      Parallel runs per eval invocation (default: 2)
  --out <dir>            Output directory (default: evals/results/arms/<timestamp>)
  --keep-raw             Keep the kept sandbox directories after collecting artifacts
`;

function parseArgs(argv) {
  const options = {
    tag: 'smoke',
    cases: [],
    arms: ['A', 'B', 'C', 'D'],
    runs: 2,
    model: 'claude-sonnet-5-5',
    judgeModel: 'claude-haiku-5-5',
    budget: 10,
    concurrency: 2,
    out: null,
    keepRaw: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    const value = () => argv[++index];
    if (flag === '--tag') options.tag = value();
    else if (flag === '--case') options.cases.push(value());
    else if (flag === '--arms')
      options.arms = value()
        .split(',')
        .map((arm) => arm.trim().toUpperCase());
    else if (flag === '--runs') options.runs = Number(value());
    else if (flag === '--model') options.model = value();
    else if (flag === '--judge-model') options.judgeModel = value();
    else if (flag === '--budget') options.budget = Number(value());
    else if (flag === '--concurrency') options.concurrency = Number(value());
    else if (flag === '--out') options.out = path.resolve(value());
    else if (flag === '--keep-raw') options.keepRaw = true;
    else if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`unknown option ${flag}\n\n${USAGE}`);
  }
  return options;
}

const PROBES = {
  python3: ['python3', ['--version']],
  node: ['node', ['--version']],
  ruby: ['ruby', ['-e', 'require "minitest"']],
  go: ['go', ['version']],
  cargo: ['cargo', ['--version']],
  java: ['javac', ['-version']],
  dotnet: ['dotnet', ['--version']],
};
const probed = new Map();
function toolchainAvailable(name) {
  if (!probed.has(name)) probed.set(name, Boolean(PROBES[name]) && spawnSync(PROBES[name][0], PROBES[name][1], { stdio: 'ignore' }).status === 0);
  return probed.get(name);
}

function snapshotFixture(testCase, destination) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'arm-fixture-home-'));
  fs.mkdirSync(destination, { recursive: true });
  const result = spawnSync('bash', [path.join(testCase.directory, 'scaffold.sh')], {
    cwd: destination,
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: os.tmpdir(), TERM: 'dumb' },
    encoding: 'utf8',
  });
  fs.rmSync(path.join(destination, '.git'), { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  if (result.status !== 0) throw new Error(`scaffold failed for ${testCase.name}: ${result.stderr}`);
}

function unseal(root) {
  spawnSync('chmod', ['-R', 'u+rwX', root], { stdio: 'ignore' });
}

function collectRun(run, destination, keepRaw) {
  fs.mkdirSync(destination, { recursive: true });
  const summary = {
    score: run.score,
    passed: run.passed,
    turns: run.turns,
    costUsd: run.costUsd,
    judgeCostUsd: run.judgeCostUsd,
    durationSeconds: run.durationSeconds,
    error: run.error,
    graders: run.graders,
  };
  fs.writeFileSync(path.join(destination, 'run.json'), `${JSON.stringify(summary, null, 2)}\n`);
  if (!run.tracePath) return;
  const keptRoot = path.dirname(path.dirname(run.tracePath));
  unseal(keptRoot);
  if (fs.existsSync(run.tracePath)) fs.copyFileSync(run.tracePath, path.join(destination, 'trace.jsonl'));
  const workspace = path.join(keptRoot, 'sealed', 'home', 'cwd');
  if (fs.existsSync(workspace)) {
    for (const relative of walkFiles(workspace)) {
      const target = path.join(destination, 'workspace', relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(workspace, relative), target);
    }
  }
  if (!keepRaw) fs.rmSync(keptRoot, { recursive: true, force: true });
}

function runEval({ arm, root, ablation, options, budget, jsonPath }) {
  const args = [
    'plugin',
    'eval',
    root,
    '--ablation',
    ablation,
    '--runs',
    String(options.runs),
    '--model',
    options.model,
    '--judge-model',
    options.judgeModel,
    '--scaffold',
    '--trust-plugin',
    '--keep-temp',
    '--no-publish',
    '--threshold',
    '0',
    '--concurrency',
    String(options.concurrency),
    '--max-cost-usd',
    budget.toFixed(2),
    '--allow-tools',
    'Write',
    'Edit',
    'NotebookEdit',
    'Bash',
    '--json',
    jsonPath,
  ];
  console.log(`\n[${arm}] claude ${args.join(' ')}`);
  const result = spawnSync('claude', args, { stdio: ['ignore', 'inherit', 'inherit'], env: process.env });
  if (!fs.existsSync(jsonPath)) throw new Error(`[${arm}] no result written (exit ${result.status})`);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
}

const options = parseArgs(process.argv.slice(2));
const selected = findCases()
  .map(loadCase)
  .filter((testCase) => (testCase.prompt.data.tags ?? []).includes(options.tag))
  .filter((testCase) => options.cases.length === 0 || options.cases.some((filter) => testCase.name.includes(filter)));
const runnable = selected.filter((testCase) => toolchainAvailable(testCase.analysis.toolchain));
const skipped = selected.filter((testCase) => !runnable.includes(testCase));
if (skipped.length)
  console.log(`Skipping ${skipped.length} case(s) whose toolchain is not on PATH: ${skipped.map((testCase) => `${testCase.name} (${testCase.analysis.toolchain})`).join(', ')}`);
if (runnable.length === 0) throw new Error('no runnable cases selected');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = options.out ?? path.join(EVALS_ROOT, 'results', 'arms', stamp);
fs.mkdirSync(path.join(out, 'raw'), { recursive: true });
const variants = buildVariants({ cases: runnable });

for (const testCase of runnable) snapshotFixture(testCase, path.join(out, 'fixtures', testCase.name));

const plan = [];
if (options.arms.includes('D') || options.arms.includes('A'))
  plan.push({ arm: 'D', ablation: options.arms.includes('A') ? 'with-without' : 'none', share: options.arms.includes('A') ? 2 : 1 });
for (const arm of ['B', 'C']) if (options.arms.includes(arm)) plan.push({ arm, ablation: 'none', share: 1 });
const totalShares = plan.reduce((sum, entry) => sum + entry.share, 0);

const manifest = {
  startedAt: new Date().toISOString(),
  tag: options.tag,
  model: options.model,
  judgeModel: options.judgeModel,
  runsPerArm: options.runs,
  budgetUsd: options.budget,
  cases: runnable.map((testCase) => testCase.name),
  skipped: skipped.map((testCase) => testCase.name),
  arms: {},
  invocations: [],
};
for (const entry of plan) {
  const jsonPath = path.join(out, 'raw', `${entry.arm}.json`);
  const result = runEval({ arm: entry.arm, root: variants[entry.arm], ablation: entry.ablation, options, budget: (options.budget * entry.share) / totalShares, jsonPath });
  manifest.invocations.push({
    arm: entry.arm,
    ablation: entry.ablation,
    costUsd: result.costUsd,
    durationSeconds: result.durationSeconds,
    partial: result.partial,
    partialReason: result.partialReason ?? null,
    claudeVersion: result.claudeVersion,
  });
  for (const caseResult of result.cases) {
    const armRuns = [[entry.arm, caseResult.arms.with ?? []]];
    if (entry.ablation === 'with-without') armRuns.push(['A', caseResult.arms.without ?? []]);
    for (const [label, runs] of armRuns) {
      manifest.arms[label] ??= { description: label === 'A' ? 'No plugin (native baseline)' : ARMS[label].description, runs: 0 };
      runs.forEach((run, index) => {
        collectRun(run, path.join(out, 'runs', label, caseResult.name, String(index)), options.keepRaw);
        manifest.arms[label].runs++;
      });
    }
  }
}
manifest.finishedAt = new Date().toISOString();
manifest.totalCostUsd = manifest.invocations.reduce((sum, entry) => sum + (entry.costUsd ?? 0), 0);
fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(
  `\nCollected ${Object.values(manifest.arms).reduce((sum, arm) => sum + arm.runs, 0)} runs into ${path.relative(process.cwd(), out)} (estimated cost $${manifest.totalCostUsd.toFixed(2)})`,
);
console.log(`Next: node evals/tools/analyze.mjs ${path.relative(process.cwd(), out)}`);
