#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { evaluateRegexGrader, findCases, loadCase } from './lib.mjs';

const TOOLCHAIN_PROBES = {
  python3: ['python3', ['--version']],
  node: ['node', ['--version']],
  ruby: ['ruby', ['-e', 'require "minitest"']],
  go: ['go', ['version']],
  cargo: ['cargo', ['--version']],
  java: ['java', ['-version']],
  dotnet: ['dotnet', ['--version']],
};

const available = new Map();
function hasToolchain(name) {
  if (!available.has(name)) {
    const probe = TOOLCHAIN_PROBES[name];
    available.set(name, Boolean(probe) && spawnSync(probe[0], probe[1], { stdio: 'ignore' }).status === 0);
  }
  return available.get(name);
}

function run(command, cwd, env) {
  const result = spawnSync('bash', ['-c', command], { cwd, env, encoding: 'utf8', timeout: 300_000 });
  return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}

function copyTree(from, to) {
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(target, { recursive: true });
      copyTree(source, target);
    } else {
      fs.copyFileSync(source, target);
    }
  }
}

function fileReader(workspace) {
  return (target) => {
    if (target && typeof target === 'object' && target.source === 'file') {
      const full = path.join(workspace, target.path);
      return fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
    }
    return null;
  };
}

function validate(testCase, { requireToolchains }) {
  const { analysis, graders, directory } = testCase;
  const problems = [];
  const toolchain = analysis.toolchain;
  if (!toolchain) return { status: 'invalid', problems: ['analysis.json is missing "toolchain"'] };
  if (!analysis.testCommand) return { status: 'invalid', problems: ['analysis.json is missing "testCommand"'] };
  if (!hasToolchain(toolchain)) return { status: requireToolchains ? 'invalid' : 'skipped', problems: [`${toolchain} is not installed`] };
  for (const required of ['tests-pass', 'tests-ran']) if (!graders.some((grader) => grader.name === required)) problems.push(`missing grader ${required}`);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-home-'));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'fixture-'));
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: os.tmpdir(),
    TERM: 'dumb',
    GOFLAGS: '-mod=mod',
    GOCACHE: path.join(home, 'gocache'),
    GOPATH: path.join(home, 'go'),
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_NOLOGO: '1',
    CARGO_HOME: process.env.CARGO_HOME ?? path.join(os.homedir(), '.cargo'),
    RUSTUP_HOME: process.env.RUSTUP_HOME ?? path.join(os.homedir(), '.rustup'),
  };
  for (const key of ['JAVA_HOME', 'DOTNET_ROOT']) if (process.env[key]) env[key] = process.env[key];
  const scaffold = run(`bash ${JSON.stringify(path.join(directory, 'scaffold.sh'))}`, workspace, env);
  if (scaffold.status !== 0) return { status: 'invalid', problems: [`scaffold failed: ${scaffold.output.slice(-400)}`] };

  const initial = run(analysis.testCommand, workspace, env);
  const initiallyPasses = initial.status === 0;
  if (analysis.initialTestsPass === true && !initiallyPasses) problems.push(`tests should pass before the change but failed:\n${initial.output.slice(-600)}`);
  if (analysis.initialTestsPass !== true && initiallyPasses) problems.push('tests already pass before the change; the task is not tested');

  const referenceDirectory = path.join(directory, 'reference');
  if (!fs.existsSync(referenceDirectory)) {
    problems.push('missing reference/ solution');
  } else {
    copyTree(referenceDirectory, workspace);
    const final = run(analysis.testCommand, workspace, env);
    fs.writeFileSync(path.join(workspace, 'test-results.txt'), final.output);
    if (final.status !== 0) problems.push(`reference solution fails its tests:\n${final.output.slice(-800)}`);
    const read = fileReader(workspace);
    for (const grader of graders.filter((entry) => entry.type === 'regex' && typeof entry.target === 'object')) {
      const result = evaluateRegexGrader(grader, read);
      if (!result.passed) problems.push(`reference fails grader ${grader.name} (${result.explanation})`);
    }
    const ran = graders.find((grader) => grader.name === 'tests-ran');
    if (ran?.input_match && !new RegExp(ran.input_match).test(JSON.stringify({ command: analysis.testCommand }))) {
      problems.push(`tests-ran input_match ${ran.input_match} does not match the documented test command`);
    }
  }
  fs.rmSync(workspace, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
  return { status: problems.length ? 'invalid' : 'valid', problems };
}

const args = process.argv.slice(2);
const filter = args.find((argument) => !argument.startsWith('--'));
const requireToolchains = args.includes('--require-toolchains');
const cases = findCases()
  .map(loadCase)
  .filter((testCase) => !filter || testCase.name.includes(filter) || testCase.directory.includes(filter));
let invalid = 0;
const counts = { valid: 0, skipped: 0, invalid: 0 };
for (const testCase of cases) {
  const result = validate(testCase, { requireToolchains });
  counts[result.status]++;
  if (result.status === 'invalid') invalid++;
  const label = { valid: 'ok  ', skipped: 'skip', invalid: 'FAIL' }[result.status];
  console.log(`${label} ${path.relative(process.cwd(), testCase.directory)}${result.problems.length ? `\n     ${result.problems.join('\n     ')}` : ''}`);
}
console.log(`\n${counts.valid} valid, ${counts.skipped} skipped (toolchain missing), ${counts.invalid} invalid`);
process.exitCode = invalid > 0 ? 1 : 0;
