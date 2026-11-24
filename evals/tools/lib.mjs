import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const EVALS_ROOT = path.join(REPO_ROOT, 'evals');

function parseDoubleQuoted(text) {
  return text.replace(/\\(["\\/bfnrt]|u[0-9a-fA-F]{4})/g, (_, sequence) => {
    if (sequence.startsWith('u')) return String.fromCharCode(Number.parseInt(sequence.slice(1), 16));
    return { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[sequence] ?? sequence;
  });
}

function splitFlow(text) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') current += text[++index] ?? '';
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseScalar(raw) {
  const value = raw.trim();
  if (value.startsWith('"') && value.endsWith('"')) return parseDoubleQuoted(value.slice(1, -1));
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  if (value.startsWith('[') && value.endsWith(']')) return splitFlow(value.slice(1, -1)).map(parseScalar);
  if (value.startsWith('{') && value.endsWith('}')) {
    const object = {};
    for (const pair of splitFlow(value.slice(1, -1))) {
      const index = pair.indexOf(':');
      object[pair.slice(0, index).trim()] = parseScalar(pair.slice(index + 1));
    }
    return object;
  }
  if (value === 'true' || value === 'false') return value === 'true';
  if (value === 'null' || value === '~' || value === '') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const listItem = /^\s+-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(data[currentKey])) data[currentKey] = [];
      data[currentKey].push(parseScalar(listItem[1]));
      continue;
    }
    const nested = /^\s+([\w.-]+):\s*(.*)$/.exec(line);
    if (nested && currentKey) {
      if (typeof data[currentKey] !== 'object' || data[currentKey] === null || Array.isArray(data[currentKey])) data[currentKey] = {};
      data[currentKey][nested[1]] = parseScalar(nested[2]);
      continue;
    }
    const pair = /^([\w.-]+):\s*(.*)$/.exec(line);
    if (!pair) continue;
    currentKey = pair[1];
    data[currentKey] = pair[2].trim() === '' ? null : parseScalar(pair[2]);
  }
  return { data, body: match[2] };
}

export function findCases(root = EVALS_ROOT) {
  const cases = [];
  const visit = (directory) => {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    if (entries.some((entry) => entry.name === 'prompt.md')) {
      cases.push(directory);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || ['results', 'tools', 'mocks', 'analysis', 'reference'].includes(entry.name)) continue;
      visit(path.join(directory, entry.name));
    }
  };
  visit(root);
  return cases.sort();
}

export function loadCase(directory) {
  const prompt = parseFrontmatter(fs.readFileSync(path.join(directory, 'prompt.md'), 'utf8'));
  const graderDirectory = path.join(directory, 'graders');
  const graders = fs.existsSync(graderDirectory)
    ? fs
        .readdirSync(graderDirectory)
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => {
          const { data, body } = parseFrontmatter(fs.readFileSync(path.join(graderDirectory, name), 'utf8'));
          return { name: name.replace(/\.md$/, ''), ...data, body: body.trim() };
        })
    : [];
  const analysisPath = path.join(directory, 'analysis.json');
  const analysis = fs.existsSync(analysisPath) ? JSON.parse(fs.readFileSync(analysisPath, 'utf8')) : {};
  return { directory, name: prompt.data.name ?? path.basename(directory), prompt, graders, analysis };
}

export function evaluateRegexGrader(grader, readTarget) {
  const content = readTarget(grader.target ?? 'last_message');
  if (content === null) return { passed: false, explanation: 'target missing' };
  const pattern = new RegExp(grader.pattern, grader.flags ?? '');
  const match = String(grader.match ?? 'contains');
  if (match === 'not_contains') return { passed: !pattern.test(content), explanation: 'pattern must be absent' };
  if (match.startsWith('count:')) {
    const expected = Number(match.slice('count:'.length));
    const global = new RegExp(grader.pattern, `${(grader.flags ?? '').replace('g', '')}g`);
    const count = [...content.matchAll(global)].length;
    return { passed: count === expected, explanation: `found ${count}, expected ${expected}` };
  }
  return { passed: pattern.test(content), explanation: 'pattern must be present' };
}

export function walkFiles(root, { skip = ['.git', 'node_modules', 'target', 'bin', 'obj', '__pycache__', '.pytest_cache'] } = {}) {
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (skip.includes(entry.name)) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(full);
      else if (entry.isFile()) files.push(path.relative(root, full).split(path.sep).join('/'));
    }
  };
  visit(root);
  return files.sort();
}
