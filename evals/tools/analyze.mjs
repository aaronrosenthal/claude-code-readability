#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findCases, loadCase, walkFiles } from './lib.mjs';
import { approximateCognitiveComplexity, classifyRevision, commentStats, identifierQuality, lexFile, lineDiff, newCommentFindings, structure } from './metrics.mjs';
import { bootstrapMean, formatInterval, pairedDifference, wilson } from './stats.mjs';

const IGNORED_OUTPUTS = /^(?:test-results\.txt|out\/|bin\/|obj\/|target\/|__pycache__\/)|\/(?:bin|obj|target|__pycache__)\//;
const REJECTION = /readability: (?:This edit introduces|edit blocked)/;
const RELEASE = /readability: allowing this edit after repeated rejections/;
const CONFIG_ASK = /readability: (?:this edit to .* weakens|.* is the readability plugin's own configuration)/;
const SHELL_WRITE =
  /(?:^|[;&|]\s*)(?:cat|tee|printf|echo)\b[^\n]*(?:>|\btee\b)\s*['"]?[\w./-]+\.(?:py|ts|tsx|js|go|rs|rb|java|cs|kt|swift|c|cc|cpp|h|php)\b|\bsed\s+-i\b|\bperl\s+-pi\b|open\([^)]*['"]w['"]|writeFileSync|File\.write/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
}

function resultText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : (part.text ?? ''))).join('\n');
  return '';
}

export function parseTrace(tracePath) {
  const events = { toolUses: [], results: new Map(), usage: null, totalCostUsd: null, durationMs: null };
  if (!fs.existsSync(tracePath)) return events;
  for (const line of fs.readFileSync(tracePath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type === 'assistant') {
      for (const part of event.message?.content ?? []) if (part.type === 'tool_use') events.toolUses.push({ id: part.id, name: part.name, input: part.input ?? {} });
    } else if (event.type === 'user' && Array.isArray(event.message?.content)) {
      for (const part of event.message.content)
        if (part.type === 'tool_result') events.results.set(part.tool_use_id, { text: resultText(part.content), isError: Boolean(part.is_error) });
    } else if (event.type === 'result') {
      events.usage = event.usage ?? null;
      events.totalCostUsd = event.total_cost_usd ?? null;
      events.durationMs = event.duration_ms ?? null;
    }
  }
  return events;
}

function targetPath(toolUse, workspaceRoot) {
  const file = toolUse.input.file_path ?? toolUse.input.notebook_path;
  if (!file) return null;
  const marker = '/home/cwd/';
  const index = file.indexOf(marker);
  return index === -1 ? path.relative(workspaceRoot, file) : file.slice(index + marker.length);
}

function proposedText(toolUse) {
  if (toolUse.name === 'Write') return toolUse.input.content ?? '';
  if (toolUse.name === 'Edit') return toolUse.input.new_string ?? '';
  if (toolUse.name === 'NotebookEdit') return toolUse.input.new_source ?? '';
  return null;
}

function hookActivity(trace) {
  const rejections = [];
  const revisions = [];
  let releases = 0;
  let configAsks = 0;
  let shellWrites = 0;
  let shellWritesAfterRejection = 0;
  const rejectedFiles = new Set();
  for (const toolUse of trace.toolUses) {
    const result = trace.results.get(toolUse.id);
    const text = result?.text ?? '';
    if (REJECTION.test(text)) {
      const file = targetPath(toolUse, '/');
      rejections.push({ tool: toolUse.name, file, message: text.slice(0, 2000) });
      rejectedFiles.add(file);
      const proposal = proposedText(toolUse);
      const next = trace.toolUses
        .slice(trace.toolUses.indexOf(toolUse) + 1)
        .find(
          (candidate) =>
            ['Write', 'Edit', 'NotebookEdit'].includes(candidate.name) && targetPath(candidate, '/') === file && !REJECTION.test(trace.results.get(candidate.id)?.text ?? ''),
        );
      if (proposal !== null && next) {
        const classification = classifyRevision(file.replace(/\.ipynb$/, '.py'), proposal, proposedText(next));
        revisions.push({ file, ...classification });
      }
    }
    if (RELEASE.test(text)) releases++;
    if (CONFIG_ASK.test(text)) configAsks++;
    if (toolUse.name === 'Bash' && SHELL_WRITE.test(toolUse.input.command ?? '')) {
      shellWrites++;
      if (rejectedFiles.size > 0) shellWritesAfterRejection++;
    }
  }
  return { rejections, revisions, releases, configAsks, shellWrites, shellWritesAfterRejection };
}

function tokenTotals(usage) {
  if (!usage) return null;
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
  return { input, output: usage.output_tokens ?? 0, total: input + (usage.output_tokens ?? 0) };
}

function graderPassed(run, name) {
  const grader = run.graders?.find((entry) => entry.name === name);
  return grader ? grader.passed : null;
}

function analyzeRun({ testCase, fixtureRoot, runDirectory }) {
  const run = readJson(path.join(runDirectory, 'run.json'));
  const workspace = path.join(runDirectory, 'workspace');
  const trace = parseTrace(path.join(runDirectory, 'trace.jsonl'));
  const { analysis } = testCase;
  const targets = analysis.targets ?? [];
  const tests = new Set(analysis.tests ?? []);
  const fixtureFiles = new Set(walkFiles(fixtureRoot));
  const finalFiles = fs.existsSync(workspace) ? walkFiles(workspace) : [];

  const passesTests = graderPassed(run, 'tests-pass') === true;
  const testsIntact = graderPassed(run, 'tests-untouched') !== false;
  const correct = passesTests && testsIntact;
  const structural = (run.graders ?? []).filter((grader) => !['tests-pass', 'tests-ran', 'tests-untouched', 'maintainability'].includes(grader.name) && grader.scored !== false);
  const maintainability = graderPassed(run, 'maintainability');

  let newCommentLines = 0;
  let classifierUnnecessary = 0;
  let changedLines = 0;
  let unrelatedChurn = 0;
  let complexity = 0;
  let functions = 0;
  let types = 0;
  const identifiers = new Set();
  for (const relative of new Set([...fixtureFiles, ...finalFiles])) {
    if (IGNORED_OUTPUTS.test(relative)) continue;
    const before = fixtureFiles.has(relative) ? readText(path.join(fixtureRoot, relative)) : '';
    const after = finalFiles.includes(relative) ? readText(path.join(workspace, relative)) : '';
    if (before === after) continue;
    const diff = lineDiff(before ?? '', after ?? '');
    const isTarget =
      targets.includes(relative) ||
      (!fixtureFiles.has(relative) && !tests.has(relative) && lexFile(relative, after ?? '') !== null && !/(?:^|\/)tests?\/|_test\.|\.test\.|Test\.java$|Tests?\//.test(relative));
    if (isTarget) changedLines += diff.added + diff.removed;
    else if (!tests.has(relative) && !GENERATED_LOCKFILE.test(relative)) unrelatedChurn += diff.added + diff.removed;
    if (isTarget && after) {
      const beforeStats = before ? commentStats(relative, before) : { commentLines: 0 };
      const afterStats = commentStats(relative, after);
      if (afterStats) newCommentLines += Math.max(0, afterStats.commentLines - (beforeStats?.commentLines ?? 0));
      const classified = newCommentFindings(relative, before || null, after);
      if (classified) classifierUnnecessary += classified.unnecessary;
    }
  }
  for (const relative of targets) {
    const after = readText(path.join(workspace, relative));
    if (!after) continue;
    complexity += approximateCognitiveComplexity(relative, after);
    const shape = structure(relative, after);
    functions += shape.functions.length;
    types += shape.types;
    for (const name of shape.identifiers) identifiers.add(name);
  }
  const preserved = (analysis.preserve ?? []).map((needle) => finalFiles.some((relative) => (readText(path.join(workspace, relative)) ?? '').includes(needle)));
  const hook = hookActivity(trace);
  const tokens = tokenTotals(trace.usage);

  return {
    correct,
    passesTests,
    testsIntact,
    structuralPassRate: structural.length ? structural.filter((grader) => grader.passed).length / structural.length : null,
    structuralFailures: structural.filter((grader) => !grader.passed).map((grader) => grader.name),
    maintainability,
    newCommentLines,
    classifierUnnecessary,
    commentDensity: changedLines ? (100 * newCommentLines) / changedLines : 0,
    preservedShare: preserved.length ? preserved.filter(Boolean).length / preserved.length : null,
    changedLines,
    unrelatedChurn,
    complexity,
    functions,
    types,
    identifier: identifierQuality([...identifiers]),
    rejections: hook.rejections.length,
    retries: hook.revisions.length,
    releases: hook.releases,
    configAsks: hook.configAsks,
    shellWrites: hook.shellWrites,
    shellWritesAfterRejection: hook.shellWritesAfterRejection,
    revisions: hook.revisions,
    rejectionMessages: hook.rejections,
    tokens,
    costUsd: run.costUsd ?? trace.totalCostUsd,
    durationSeconds: run.durationSeconds,
    turns: run.turns,
    error: run.error,
  };
}

const METRICS = [
  ['correct', 'Functional correctness (tests pass, tests intact)', 'rate'],
  ['structuralPassRate', 'Structural graders passed (preserved directives, required docs, no circumvention)', 'mean'],
  ['maintainability', 'Maintainability judge PASS (unmodified code, comments visible)', 'rate'],
  ['newCommentLines', 'New non-directive comment lines in target files', 'mean'],
  ['classifierUnnecessary', 'New comments the hook classifier would reject (circular for C/D)', 'mean'],
  ['commentDensity', 'New comment lines per 100 changed target lines', 'mean'],
  ['preservedShare', 'Necessary pre-existing comments/directives preserved', 'mean'],
  ['unrelatedChurn', 'Changed lines outside targets and tests', 'mean'],
  ['complexity', 'Approximate cognitive complexity of target files', 'mean'],
  ['functions', 'Function definitions in target files', 'mean'],
  ['types', 'Type definitions in target files', 'mean'],
  ['rejections', 'Hook rejections per run', 'mean'],
  ['retries', 'Rejected edits followed by a revised edit', 'mean'],
  ['shellWrites', 'Source files written through the shell', 'mean'],
  ['tokens.total', 'Tokens (input incl. cache + output)', 'mean'],
  ['durationSeconds', 'Wall-clock seconds', 'mean'],
  ['costUsd', 'Estimated cost (USD, list price)', 'mean'],
];

function metricValue(entry, key) {
  if (key === 'maintainability') return entry.maintainability === null ? null : Number(entry.maintainability);
  return key.split('.').reduce((value, part) => (value === null || value === undefined ? null : value[part]), entry);
}

const GENERATED_LOCKFILE = /(?:^|\/)(?:Cargo\.lock|package-lock\.json|go\.sum|Gemfile\.lock|poetry\.lock|yarn\.lock|pnpm-lock\.yaml)$/;

const INFRASTRUCTURE_ERROR = /usage limit|5-hour limit|rate[_ ]limit|overloaded|api_error|\b(?:429|5\d\d)\b/i;

export function isInfrastructureError(entry) {
  return Boolean(entry.error) && INFRASTRUCTURE_ERROR.test(String(entry.error));
}

export function summarize(allResults, judgments = null) {
  const results = allResults.filter((entry) => !isInfrastructureError(entry));
  const excluded = allResults.length - results.length;
  const arms = [...new Set(results.map((entry) => entry.arm))].sort();
  const lines = ['# Readability evaluation report', ''];
  lines.push(`Runs analyzed: ${results.length} across ${new Set(results.map((entry) => entry.case)).size} cases and arms ${arms.join(', ')}.`, '');
  if (excluded > 0) {
    lines.push(
      `**Excluded:** ${excluded} run(s) that ended in an API or usage-limit error before the agent could work. They say nothing about the treatment and are not counted as incorrect. Rerun them for a balanced comparison.`,
      '',
    );
  }
  const failedEverywhere = [...new Set(results.map((entry) => entry.case))].filter((name) => results.every((entry) => entry.case !== name || !entry.correct));
  if (failedEverywhere.length > 0) {
    lines.push(
      `**Warning:** ${failedEverywhere.length} case(s) failed in every run of every arm, which usually means the environment is broken (for example a toolchain the eval sandbox cannot read) rather than the treatment: ${failedEverywhere.map((name) => `\`${name}\``).join(', ')}. Check their \`test-results.txt\` before interpreting the results.`,
      '',
    );
  }
  lines.push(
    'Intervals are 95% bootstrap intervals over runs (rates: Wilson intervals). They describe run-to-run variation for these fixed cases and model, not a population of tasks.',
    '',
  );
  lines.push(`| Metric | ${arms.join(' | ')} |`, `| :- | ${arms.map(() => '-:').join(' | ')} |`);
  for (const [key, label, kind] of METRICS) {
    const cells = arms.map((arm) => {
      const values = results
        .filter((entry) => entry.arm === arm)
        .map((entry) => metricValue(entry, key))
        .filter((value) => value !== null && value !== undefined && !Number.isNaN(value));
      if (values.length === 0) return 'n/a';
      if (kind === 'rate') {
        const successes = values.filter((value) => value === true || value === 1).length;
        return formatInterval(wilson(successes, values.length), true);
      }
      return formatInterval(bootstrapMean(values));
    });
    lines.push(`| ${label} | ${cells.join(' | ')} |`);
  }

  lines.push('', '## Paired differences against arm A (per-case means, bootstrap over cases)', '');
  lines.push('Positive means the arm is higher than A. Readability metrics below count only runs that passed the correctness gate in both arms.', '');
  const comparable = ['newCommentLines', 'commentDensity', 'complexity', 'unrelatedChurn', 'functions', 'tokens.total', 'durationSeconds', 'costUsd'];
  lines.push(
    `| Metric | ${arms.filter((arm) => arm !== 'A').join(' | ')} |`,
    `| :- | ${arms
      .filter((arm) => arm !== 'A')
      .map(() => '-:')
      .join(' | ')} |`,
  );
  for (const key of ['correct', ...comparable]) {
    const cells = arms
      .filter((arm) => arm !== 'A')
      .map((arm) => {
        const difference = pairedDifference(
          results,
          'A',
          arm,
          (entry) => {
            const value = metricValue(entry, key);
            return typeof value === 'boolean' ? Number(value) : value;
          },
          { requireCorrect: key !== 'correct' },
        );
        return difference ? `${formatInterval(difference.interval)} (${difference.cases} cases)` : 'n/a';
      });
    lines.push(`| ${key} | ${cells.join(' | ')} |`);
  }

  lines.push('', '## Revisions after hook rejections', '');
  const labels = [
    'comment deletion only',
    'identifier improvement',
    'control flow improvement',
    'function decomposition',
    'type or domain modeling improvement',
    'unnecessary abstraction',
    'other changes',
  ];
  lines.push(`| Primary label | ${arms.join(' | ')} |`, `| :- | ${arms.map(() => '-:').join(' | ')} |`);
  for (const label of labels) {
    lines.push(
      `| ${label} | ${arms
        .map(
          (arm) =>
            results
              .filter((entry) => entry.arm === arm)
              .flatMap((entry) => entry.revisions)
              .filter((revision) => revision.primary === label).length,
        )
        .join(' | ')} |`,
    );
  }
  lines.push('', 'Labels come from deterministic heuristics over the rejected and the accepted proposal (see docs/evaluation.md); treat them as indicative.');

  if (judgments) {
    lines.push('', '## Blinded pairwise judgments', '');
    lines.push(judgments);
  }

  lines.push('', '## Per-case results', '');
  const cases = [...new Set(results.map((entry) => entry.case))].sort();
  lines.push(`| Case | ${arms.map((arm) => `${arm} correct`).join(' | ')} | ${arms.map((arm) => `${arm} new comments`).join(' | ')} |`);
  lines.push(`| :- | ${arms.map(() => '-:').join(' | ')} | ${arms.map(() => '-:').join(' | ')} |`);
  for (const name of cases) {
    const correctCells = arms.map((arm) => {
      const runs = results.filter((entry) => entry.arm === arm && entry.case === name);
      return runs.length ? `${runs.filter((entry) => entry.correct).length}/${runs.length}` : '–';
    });
    const commentCells = arms.map((arm) => {
      const runs = results.filter((entry) => entry.arm === arm && entry.case === name);
      return runs.length ? (runs.reduce((sum, entry) => sum + entry.newCommentLines, 0) / runs.length).toFixed(1) : '–';
    });
    lines.push(`| ${name} | ${correctCells.join(' | ')} | ${commentCells.join(' | ')} |`);
  }
  return lines.join('\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = path.resolve(process.argv[2] ?? '');
  if (!process.argv[2] || !fs.existsSync(path.join(out, 'manifest.json'))) {
    console.error('Usage: node evals/tools/analyze.mjs <arms output directory>');
    process.exit(1);
  }
  const casesByName = new Map(
    findCases()
      .map(loadCase)
      .map((testCase) => [testCase.name, testCase]),
  );
  const results = [];
  for (const arm of fs.readdirSync(path.join(out, 'runs'))) {
    for (const caseName of fs.readdirSync(path.join(out, 'runs', arm))) {
      const testCase = casesByName.get(caseName);
      if (!testCase) continue;
      for (const index of fs.readdirSync(path.join(out, 'runs', arm, caseName))) {
        const runDirectory = path.join(out, 'runs', arm, caseName, index);
        results.push({ arm, case: caseName, index: Number(index), ...analyzeRun({ testCase, fixtureRoot: path.join(out, 'fixtures', caseName), runDirectory }) });
      }
    }
  }
  fs.mkdirSync(path.join(out, 'analysis'), { recursive: true });
  fs.writeFileSync(path.join(out, 'analysis', 'metrics.json'), `${JSON.stringify(results, null, 2)}\n`);
  const judgmentsPath = path.join(out, 'analysis', 'judgments.md');
  const report = summarize(results, fs.existsSync(judgmentsPath) ? fs.readFileSync(judgmentsPath, 'utf8') : null);
  fs.writeFileSync(path.join(out, 'analysis', 'report.md'), `${report}\n`);
  console.log(report);
}
