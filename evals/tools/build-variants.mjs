#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { EVALS_ROOT, findCases, loadCase, REPO_ROOT } from './lib.mjs';

export const ARMS = {
  B: { variant: 'skill-only', description: 'Readability skill only, no hook' },
  C: { variant: 'hook-minimal', description: 'Hook with minimal rejection feedback, no skill' },
  D: { variant: 'full', description: 'Full plugin: skill, hook, actionable feedback' },
};

export const VARIANTS_ROOT = path.join(REPO_ROOT, '.eval-variants');

function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) });
}

function hooksConfig(feedback) {
  const hooks = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'));
  if (feedback === 'minimal') {
    for (const group of hooks.hooks.PreToolUse) for (const hook of group.hooks) hook.args = [...hook.args, '--feedback=minimal'];
  }
  return hooks;
}

export function buildVariants({ cases }) {
  fs.rmSync(VARIANTS_ROOT, { recursive: true, force: true });
  const manifest = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const built = {};
  for (const [arm, { variant }] of Object.entries(ARMS)) {
    const root = path.join(VARIANTS_ROOT, variant);
    fs.mkdirSync(path.join(root, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(root, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ ...manifest, experimental: undefined }, null, 2)}\n`);
    const withSkill = arm === 'B' || arm === 'D';
    const withHook = arm === 'C' || arm === 'D';
    if (withSkill) copy(path.join(REPO_ROOT, 'skills'), path.join(root, 'skills'));
    if (withHook) {
      for (const directory of ['src', 'scripts']) copy(path.join(REPO_ROOT, directory), path.join(root, directory));
      fs.mkdirSync(path.join(root, 'hooks'), { recursive: true });
      fs.writeFileSync(path.join(root, 'hooks', 'hooks.json'), `${JSON.stringify(hooksConfig(arm === 'C' ? 'minimal' : 'actionable'), null, 2)}\n`);
      fs.writeFileSync(path.join(root, 'package.json'), `${JSON.stringify({ type: 'module', private: true }, null, 2)}\n`);
    }
    for (const testCase of cases) {
      const relative = path.relative(EVALS_ROOT, testCase.directory);
      copy(testCase.directory, path.join(root, 'evals', relative));
      fs.rmSync(path.join(root, 'evals', relative, 'reference'), { recursive: true, force: true });
    }
    built[arm] = root;
  }
  return built;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const tag = process.argv.find((argument) => argument.startsWith('--tag='))?.slice('--tag='.length);
  const cases = findCases()
    .map(loadCase)
    .filter((testCase) => !tag || (testCase.prompt.data.tags ?? []).includes(tag));
  const built = buildVariants({ cases });
  for (const [arm, root] of Object.entries(built)) console.log(`${arm} (${ARMS[arm].description}): ${path.relative(REPO_ROOT, root)}`);
  console.log(`${cases.length} cases copied into each variant`);
}
