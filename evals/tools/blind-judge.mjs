#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { analyzeChange } from '../../src/classify/analyze.mjs';
import { defaultConfig } from '../../src/config/config.mjs';
import { discoverDocumentationRequirements } from '../../src/discovery/index.mjs';
import { parseTrace } from './analyze.mjs';
import { findCases, loadCase, walkFiles } from './lib.mjs';
import { lexFile, stripComments } from './metrics.mjs';
import { formatInterval, shuffleWithSeed, wilson } from './stats.mjs';

const USAGE = `Usage: node evals/tools/blind-judge.mjs <arms output directory> [options]

Blinded pairwise readability judgments between arms. Run analyze.mjs first.

Options:
  --pairs <list>       Comparisons, e.g. A:D,B:D,C:D (default: A:D)
  --model <id>         Judge model (default: claude-sonnet-5-5)
  --budget <usd>       Stop starting new judge calls after this estimated spend (default: 5)
  --audit-comments     Also label rejected and surviving comments as necessary or unnecessary (hook FP/FN)
  --audit-only         Reuse pairwise records from an earlier judgments.json and only redo the comment audit
  --seed <n>           Seed for presentation order (default: 7)
`;

const CRITERIA = {
  readability: 'Overall intrinsic readability: how quickly a competent engineer new to this code understands what it does and why.',
  identifiers: 'Identifier quality: names communicate domain intent at an appropriate length.',
  controlFlow: 'Control flow clarity: straightforward branching and looping, guard clauses where they help, no needless flags or nesting.',
  abstraction: 'Appropriate abstraction: neither tangled monoliths nor gratuitous helpers, wrappers, or single-use indirection.',
};

const VERDICT = { type: 'string', enum: ['1', '2', 'tie'] };
const INTRINSIC_SCHEMA = {
  type: 'object',
  properties: { ...Object.fromEntries(Object.keys(CRITERIA).map((key) => [key, VERDICT])), rationale: { type: 'string' } },
  required: [...Object.keys(CRITERIA), 'rationale'],
};
const MAINTAINABILITY_SCHEMA = { type: 'object', properties: { maintainability: VERDICT, rationale: { type: 'string' } }, required: ['maintainability', 'rationale'] };
const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    labels: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, label: { type: 'string', enum: ['necessary', 'unnecessary'] } }, required: ['id', 'label'] },
    },
  },
  required: ['labels'],
};

function parseArgs(argv) {
  const options = { out: null, pairs: [['A', 'D']], model: 'claude-sonnet-5-5', budget: 5, audit: false, auditOnly: false, seed: 7 };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--pairs') options.pairs = argv[++index].split(',').map((pair) => pair.split(':').map((arm) => arm.trim().toUpperCase()));
    else if (flag === '--model') options.model = argv[++index];
    else if (flag === '--budget') options.budget = Number(argv[++index]);
    else if (flag === '--audit-comments') options.audit = true;
    else if (flag === '--audit-only') {
      options.audit = true;
      options.auditOnly = true;
    } else if (flag === '--seed') options.seed = Number(argv[++index]);
    else if (flag === '--help' || flag === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else if (!options.out) options.out = path.resolve(flag);
    else throw new Error(`unknown option ${flag}`);
  }
  if (!options.out) {
    console.error(USAGE);
    process.exit(1);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const judgeDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'blind-judge-'));
let spent = 0;

function judge(prompt, schema) {
  if (spent >= options.budget) return null;
  const result = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      options.model,
      '--setting-sources',
      '',
      '--disable-slash-commands',
      '--strict-mcp-config',
      '--tools',
      '',
      '--no-session-persistence',
      '--output-format',
      'json',
      '--json-schema',
      JSON.stringify(schema),
      '--system-prompt',
      'You are an experienced software engineer reviewing code. You judge only what is in front of you and answer in the requested JSON format.',
    ],
    { cwd: judgeDirectory, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300_000 },
  );
  try {
    const parsed = JSON.parse(result.stdout);
    spent += parsed.total_cost_usd ?? 0;
    if (parsed.is_error) return null;
    return parsed.structured_output ?? JSON.parse(parsed.result);
  } catch {
    return null;
  }
}

function candidateFiles(testCase, workspace) {
  const targets = new Set(testCase.analysis.targets ?? []);
  const tests = new Set(testCase.analysis.tests ?? []);
  if (fs.existsSync(workspace)) {
    for (const relative of walkFiles(workspace)) {
      if (tests.has(relative) || /(?:^|\/)tests?\/|_test\.|\.test\.|Test\.java$|Tests?\//.test(relative) || relative === 'test-results.txt') continue;
      if (lexFile(relative, '') !== null) targets.add(relative);
    }
  }
  return [...targets].filter((relative) => fs.existsSync(path.join(workspace, relative)));
}

function render(files, workspace, normalize) {
  return files
    .map((relative) => {
      const source = fs.readFileSync(path.join(workspace, relative), 'utf8');
      const text = normalize ? stripComments(relative, source, { keepDirectives: true, stripDocstrings: true }).text : source;
      return `File: ${relative}\n\`\`\`\n${text.trimEnd()}\n\`\`\``;
    })
    .join('\n\n');
}

function changedFiles(testCase, fixtureRoot, workspace) {
  return candidateFiles(testCase, workspace).filter((relative) => {
    const fixture = path.join(fixtureRoot, relative);
    return !fs.existsSync(fixture) || fs.readFileSync(fixture, 'utf8') !== fs.readFileSync(path.join(workspace, relative), 'utf8');
  });
}

function pairwisePrompt(task, first, second, kind) {
  const instructions =
    kind === 'intrinsic'
      ? [
          'Two candidate implementations of the same task follow. Both pass the same tests. All comments and docstrings have been removed from both, except machine-read tool directives, so judge the code itself.',
          'For each criterion, answer "1", "2", or "tie". Prefer "tie" when the difference is negligible. Do not reward brevity or length by itself.',
          ...Object.entries(CRITERIA).map(([key, description]) => `- ${key}: ${description}`),
        ]
      : [
          'Two candidate implementations of the same task follow, exactly as written, including their comments. Both pass the same tests.',
          'Answer "1", "2", or "tie" for maintainability: which would a maintainer understand and change more safely, considering both the code and whether important context that the code cannot express (business constraints, compatibility workarounds, required API documentation, safety invariants) is preserved. Comment count alone is not a reason to prefer either.',
        ];
  return [
    `The task given to the developer:\n<task>\n${task.trim()}\n</task>`,
    ...instructions,
    `<candidate id="1">\n${first}\n</candidate>`,
    `<candidate id="2">\n${second}\n</candidate>`,
  ].join('\n\n');
}

function verdictFor(response, key, swapped) {
  const value = response?.[key];
  if (value === 'tie' || value === undefined) return value === 'tie' ? 'tie' : null;
  return (value === '1') !== swapped ? 'left' : 'right';
}

function seedFor(...parts) {
  return Number.parseInt(crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 8), 16) ^ options.seed;
}

const metrics = JSON.parse(fs.readFileSync(path.join(options.out, 'analysis', 'metrics.json'), 'utf8'));
const casesByName = new Map(
  findCases()
    .map(loadCase)
    .map((testCase) => [testCase.name, testCase]),
);
const previousPath = path.join(options.out, 'analysis', 'judgments.json');
const previous = options.auditOnly && fs.existsSync(previousPath) ? JSON.parse(fs.readFileSync(previousPath, 'utf8')) : null;
const records = previous ? previous.records : [];
if (previous) spent = previous.spentUsd ?? 0;

for (const [left, right] of previous ? [] : options.pairs) {
  for (const name of [...new Set(metrics.map((entry) => entry.case))].sort()) {
    const testCase = casesByName.get(name);
    const fixtureRoot = path.join(options.out, 'fixtures', name);
    const leftRuns = metrics.filter((entry) => entry.case === name && entry.arm === left).sort((a, b) => a.index - b.index);
    const rightRuns = metrics.filter((entry) => entry.case === name && entry.arm === right).sort((a, b) => a.index - b.index);
    for (let index = 0; index < Math.min(leftRuns.length, rightRuns.length); index++) {
      const leftRun = leftRuns[index];
      const rightRun = rightRuns[index];
      const record = { pair: `${left}:${right}`, case: name, index };
      if (!leftRun.correct || !rightRun.correct) {
        record.gate = leftRun.correct === rightRun.correct ? 'both incorrect' : leftRun.correct ? 'left' : 'right';
        records.push(record);
        continue;
      }
      const leftWorkspace = path.join(options.out, 'runs', left, name, String(leftRun.index), 'workspace');
      const rightWorkspace = path.join(options.out, 'runs', right, name, String(rightRun.index), 'workspace');
      const files = [...new Set([...changedFiles(testCase, fixtureRoot, leftWorkspace), ...changedFiles(testCase, fixtureRoot, rightWorkspace)])].sort();
      const [first, second] = shuffleWithSeed(['left', 'right'], seedFor(name, index, left, right));
      const swappedFirst = first === 'right';
      const workspaceOf = (side) => (side === 'left' ? leftWorkspace : rightWorkspace);
      const present = (side, normalize) =>
        render(
          files.filter((relative) => fs.existsSync(path.join(workspaceOf(side), relative))),
          workspaceOf(side),
          normalize,
        );
      for (const kind of ['intrinsic', 'maintainability']) {
        const normalize = kind === 'intrinsic';
        const schema = kind === 'intrinsic' ? INTRINSIC_SCHEMA : MAINTAINABILITY_SCHEMA;
        const firstOrder = judge(pairwisePrompt(testCase.prompt.body, present(first, normalize), present(second, normalize), kind), schema);
        const secondOrder = judge(pairwisePrompt(testCase.prompt.body, present(second, normalize), present(first, normalize), kind), schema);
        const keys = kind === 'intrinsic' ? Object.keys(CRITERIA) : ['maintainability'];
        record[kind] = {};
        for (const key of keys) {
          const a = verdictFor(firstOrder, key, swappedFirst);
          const b = verdictFor(secondOrder, key, !swappedFirst);
          record[kind][key] = a === null || b === null ? null : a === b ? a : 'inconsistent';
        }
        record[`${kind}Rationale`] = [firstOrder?.rationale, secondOrder?.rationale].filter(Boolean);
      }
      records.push(record);
      process.stdout.write('.');
    }
  }
}

function excludedLines(fixtureRoot, relative, before, after) {
  const documentationRequirements = discoverDocumentationRequirements({ projectRoot: fixtureRoot });
  const result = analyzeChange({
    filePath: path.join(fixtureRoot, relative),
    projectRoot: fixtureRoot,
    before: before || null,
    after,
    config: defaultConfig(),
    documentationRequirements,
  });
  if (result.status !== 'analyzed') return new Set();
  const machineOrRequired = result.allowed.filter(
    (entry) => entry.category === 'directive' || entry.category === 'suppression' || (entry.category === 'documentation' && /required by/.test(entry.detail ?? '')),
  );
  return new Set(machineOrRequired.map((entry) => entry.line));
}

function extractNewComments(fixtureRoot, workspace, files) {
  const comments = [];
  let excluded = 0;
  for (const relative of files) {
    const after = fs.readFileSync(path.join(workspace, relative), 'utf8');
    const before = fs.existsSync(path.join(fixtureRoot, relative)) ? fs.readFileSync(path.join(fixtureRoot, relative), 'utf8') : '';
    const lexed = lexFile(relative, after);
    if (!lexed) continue;
    const skip = excludedLines(fixtureRoot, relative, before, after);
    const lines = after.split('\n');
    for (const comment of lexed.comments) {
      if (before.includes(comment.text)) continue;
      if (skip.has(comment.line)) {
        excluded++;
        continue;
      }
      const context = lines.slice(Math.max(0, comment.line - 6), comment.endLine + 6).join('\n');
      comments.push({ file: relative, text: comment.text, context });
    }
  }
  return { comments, excluded };
}

const audits = [];
if (options.audit) {
  for (const entry of metrics.filter((candidate) => candidate.arm === 'C' || candidate.arm === 'D' || candidate.arm === 'A' || candidate.arm === 'B')) {
    const testCase = casesByName.get(entry.case);
    const runDirectory = path.join(options.out, 'runs', entry.arm, entry.case, String(entry.index));
    const workspace = path.join(runDirectory, 'workspace');
    const fixtureRoot = path.join(options.out, 'fixtures', entry.case);
    const extracted = extractNewComments(fixtureRoot, workspace, changedFiles(testCase, fixtureRoot, workspace));
    const surviving = extracted.comments.map((comment, index) => ({ ...comment, id: `s${index}`, kind: 'surviving' }));
    const rejected = [];
    if (entry.arm === 'C' || entry.arm === 'D') {
      const trace = parseTrace(path.join(runDirectory, 'trace.jsonl'));
      for (const toolUse of trace.toolUses) {
        const text = trace.results.get(toolUse.id)?.text ?? '';
        if (!/readability: (?:This edit introduces|edit blocked)/.test(text)) continue;
        const proposal = toolUse.input.content ?? toolUse.input.new_string ?? toolUse.input.new_source ?? '';
        for (const match of text.matchAll(/^- (\S+?):(\d+)(?:-\d+)?\s{2}(.*)$/gm)) {
          const commentText = match[3].split(' ⏎ ')[0].replace(/…$/, '');
          const lines = proposal.split('\n');
          const at = lines.findIndex((line) => line.includes(commentText.slice(0, 40)));
          if (rejected.some((item) => item.text === match[3])) continue;
          rejected.push({
            id: `r${rejected.length}`,
            kind: 'rejected',
            file: match[1],
            text: match[3],
            context: at === -1 ? match[3] : lines.slice(Math.max(0, at - 6), at + 7).join('\n'),
          });
        }
      }
    }
    const items = shuffleWithSeed([...surviving, ...rejected], seedFor(entry.case, entry.arm, entry.index, 'audit'));
    if (items.length === 0) {
      audits.push({ arm: entry.arm, case: entry.case, index: entry.index, excludedMachineOrRequired: extracted.excluded, items: [] });
      continue;
    }
    const prompt = [
      'Label each code comment below as "necessary" or "unnecessary".',
      'necessary: it carries information the code cannot express by itself (business or regulatory constraints, compatibility workarounds, external system limitations, security or concurrency invariants, historical decisions, required public API documentation, license text) or it is read by a tool (a linter directive, type annotation, build pragma).',
      'unnecessary: it restates or narrates what the code already says, or describes something better expressed with names, types, or structure.',
      ...items.map((item) => `<comment id="${item.id}" file="${item.file}">\n${item.text}\n<context>\n${item.context}\n</context>\n</comment>`),
    ].join('\n\n');
    const response = judge(prompt, AUDIT_SCHEMA);
    if (!response) continue;
    const labels = new Map(response.labels.map((label) => [label.id, label.label]));
    audits.push({
      arm: entry.arm,
      case: entry.case,
      index: entry.index,
      excludedMachineOrRequired: extracted.excluded,
      items: items.map((item) => ({ kind: item.kind, file: item.file, text: item.text, label: labels.get(item.id) ?? null })),
    });
    process.stdout.write('a');
  }
}
process.stdout.write('\n');

function tally(pair, kind, key) {
  const relevant = records.filter((record) => record.pair === pair);
  const judged = relevant.map((record) => record[kind]?.[key]).filter((verdict) => verdict !== undefined && verdict !== null);
  const counts = { left: 0, right: 0, tie: 0, inconsistent: 0 };
  for (const verdict of judged) counts[verdict]++;
  const decisive = counts.left + counts.right;
  return { counts, rightShare: decisive ? wilson(counts.right, decisive) : null };
}

const lines = [];
lines.push(
  `Judge: ${options.model}. Each pair of correct implementations was judged twice with the presentation order swapped; disagreements between the two orders are reported as "inconsistent" and excluded from win rates. Estimated judge spend: $${spent.toFixed(2)}.`,
  '',
);
for (const [left, right] of options.pairs) {
  const pair = `${left}:${right}`;
  const gate = records.filter((record) => record.pair === pair && record.gate);
  lines.push(`### ${left} vs ${right}`, '');
  lines.push(
    `Correctness gate (not judged): ${right} only correct ${gate.filter((record) => record.gate === 'right').length}, ${left} only correct ${gate.filter((record) => record.gate === 'left').length}, both incorrect ${gate.filter((record) => record.gate === 'both incorrect').length}.`,
    '',
  );
  lines.push(`| Criterion | ${right} better | ${left} better | tie | inconsistent | ${right} win rate among decisive [95% CI] |`, '| :- | -: | -: | -: | -: | -: |');
  for (const [kind, keys] of [
    ['intrinsic', Object.keys(CRITERIA)],
    ['maintainability', ['maintainability']],
  ]) {
    for (const key of keys) {
      const { counts, rightShare } = tally(pair, kind, key);
      lines.push(
        `| ${kind === 'intrinsic' ? `${key} (comments removed)` : 'maintainability (as written)'} | ${counts.right} | ${counts.left} | ${counts.tie} | ${counts.inconsistent} | ${rightShare ? formatInterval(rightShare, true) : 'n/a'} |`,
      );
    }
  }
  lines.push('');
}
if (audits.length) {
  lines.push('### Comment audit (hook false positives and false negatives)', '');
  lines.push('| Arm | Rejected comments | judged necessary (false positive) | Surviving new comments | judged unnecessary |', '| :- | -: | -: | -: | -: |');
  for (const arm of [...new Set(audits.map((audit) => audit.arm))].sort()) {
    const items = audits.filter((audit) => audit.arm === arm).flatMap((audit) => audit.items);
    const rejected = items.filter((item) => item.kind === 'rejected' && item.label);
    const surviving = items.filter((item) => item.kind === 'surviving' && item.label);
    const falsePositives = rejected.filter((item) => item.label === 'necessary').length;
    const falseNegatives = surviving.filter((item) => item.label === 'unnecessary').length;
    lines.push(
      `| ${arm} | ${rejected.length} | ${rejected.length ? formatInterval(wilson(falsePositives, rejected.length), true) : 'n/a'} | ${surviving.length} | ${surviving.length ? formatInterval(wilson(falseNegatives, surviving.length), true) : 'n/a'} |`,
    );
  }
  lines.push(
    '',
    `Directives, linter suppressions, and documentation that the project's linter configuration requires (${audits.reduce((sum, audit) => sum + audit.excludedMachineOrRequired, 0)} comments) are excluded from the audit and not judged. Repeated rejections of the same comment are counted once per run. For arms C and D, surviving comments judged unnecessary are hook false negatives; for A and B they show what the model writes without enforcement.`,
  );
}
fs.writeFileSync(path.join(options.out, 'analysis', 'judgments.json'), `${JSON.stringify({ model: options.model, spentUsd: spent, records, audits }, null, 2)}\n`);
fs.writeFileSync(path.join(options.out, 'analysis', 'judgments.md'), `${lines.join('\n')}\n`);
fs.rmSync(judgeDirectory, { recursive: true, force: true });
console.log(lines.join('\n'));
console.log(`\nRe-run analyze.mjs to include these judgments in report.md.`);
