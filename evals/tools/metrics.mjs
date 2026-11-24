import { analyzeChange } from '../../src/classify/analyze.mjs';
import { findPythonStringStatements } from '../../src/classify/units.mjs';
import { defaultConfig } from '../../src/config/config.mjs';
import { definitionsFor } from '../../src/directives/registry.mjs';
import { detectLanguage, familyOf } from '../../src/lexer/languages.mjs';
import { lexSource } from '../../src/lexer/lex.mjs';

export function lexFile(relativePath, source) {
  const language = detectLanguage(relativePath);
  if (!language) return null;
  const lexed = lexSource(source, language.id);
  return lexed.ok ? { ...lexed, languageId: language.id } : null;
}

function isMachineConsumed(comment, family) {
  const body = comment.body ?? '';
  if (comment.style === 'shebang') return true;
  for (const definition of definitionsFor(comment.language ?? family)) {
    try {
      if (definition.match({ body, raw: comment.afterMarker ?? body, comment, family, context: {} })) return true;
    } catch {}
  }
  return /^(?:-\*-.*-\*-|(?:en)?coding[:=]|frozen_string_literal:|typed:|SPDX-License-Identifier:)/.test(body.trim());
}

export function stripComments(relativePath, source, { keepDirectives = true, stripDocstrings = true } = {}) {
  const lexed = lexFile(relativePath, source);
  if (!lexed) return { text: source, ok: false };
  const removals = lexed.comments.filter((comment) => !(keepDirectives && isMachineConsumed(comment, lexed.family))).map((comment) => [comment.start, comment.end]);
  if (stripDocstrings && lexed.family === 'python') {
    for (const statement of findPythonStringStatements(source, lexed)) removals.push([statement.start, statement.end]);
  }
  const wholeLines = removals.map(([start, end]) => {
    const lineStart = source.lastIndexOf('\n', start - 1) + 1;
    const newline = source.indexOf('\n', end);
    const lineEnd = newline === -1 ? source.length : newline;
    const ownsLine = source.slice(lineStart, start).trim() === '' && source.slice(end, lineEnd).trim() === '';
    return ownsLine ? [lineStart, newline === -1 ? lineEnd : newline + 1] : [start, end];
  });
  wholeLines.sort((a, b) => b[0] - a[0]);
  let text = source;
  for (const [start, end] of wholeLines) text = text.slice(0, start) + text.slice(end);
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
  return { text, ok: true };
}

export function commentStats(relativePath, source) {
  const lexed = lexFile(relativePath, source);
  if (!lexed) return null;
  let commentLines = 0;
  let directiveLines = 0;
  for (const comment of lexed.comments) {
    const lines = comment.endLine - comment.line + 1;
    if (isMachineConsumed(comment, lexed.family)) directiveLines += lines;
    else commentLines += lines;
  }
  const codeLines = source.split('\n').filter((line) => line.trim()).length;
  return { commentLines, directiveLines, codeLines };
}

export function newCommentFindings(relativePath, before, after) {
  const result = analyzeChange({
    filePath: `/workspace/${relativePath}`,
    projectRoot: '/workspace',
    before,
    after,
    config: defaultConfig(),
    documentationRequirements: { requirementFor: () => ({ status: 'not-required' }) },
  });
  if (result.status !== 'analyzed') return null;
  return { unnecessary: result.findings.length, allowed: result.allowed.length, findings: result.findings };
}

export function lineDiff(before, after) {
  const a = before.split('\n');
  const b = after.split('\n');
  const n = a.length;
  const m = b.length;
  if (n * m > 25_000_000) return { added: m, removed: n };
  const lengths = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lengths[i][j] = a[i] === b[j] ? lengths[i + 1][j + 1] + 1 : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
  const common = lengths[0][0];
  return { added: m - common, removed: n - common };
}

const CONTROL = /\b(?:if|for|foreach|while|until|unless|switch|case|when|match|catch|except|rescue|loop|select)\b|\?\s*[^:?\n]+\s*:/g;
const ELSE_BRANCH = /\b(?:else\s+if|elif|elsif|else)\b/g;
const BOOLEAN_SEQUENCE = /(?:&&|\|\||\band\b|\bor\b)/g;

export function approximateCognitiveComplexity(relativePath, source) {
  const stripped = stripComments(relativePath, source, { keepDirectives: false }).text;
  const lexed = lexFile(relativePath, stripped);
  const code = lexed ? lexed.masked : stripped;
  const lines = code.split('\n');
  const indents = lines.filter((line) => line.trim()).map((line) => /^[ \t]*/.exec(line)[0].replace(/\t/g, '    ').length);
  const unit = indents.filter((indent) => indent > 0).reduce((smallest, indent) => Math.min(smallest, indent), Number.POSITIVE_INFINITY);
  const indentUnit = Number.isFinite(unit) ? unit : 4;
  let total = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    const depth = Math.floor(/^[ \t]*/.exec(line)[0].replace(/\t/g, '    ').length / indentUnit);
    const nesting = Math.max(0, depth - 1);
    const structures = (line.match(CONTROL) ?? []).length;
    const branches = (line.match(ELSE_BRANCH) ?? []).length;
    const booleans = (line.match(BOOLEAN_SEQUENCE) ?? []).length;
    total += structures * (1 + nesting) + branches + (booleans > 0 ? 1 : 0);
  }
  return total;
}

const FUNCTION_PATTERNS = {
  python: /^\s*(?:async\s+)?def\s+([A-Za-z_]\w*)/gm,
  ruby: /^\s*def\s+(?:self\.)?([A-Za-z_]\w*[?!=]?)/gm,
  go: /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm,
  rust: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:const\s+|async\s+|unsafe\s+)*fn\s+([A-Za-z_]\w*)/gm,
  javascript:
    /(?:^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^\s*(?:export\s+)?(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=>|^\s+(?:(?:public|private|protected|static|async|readonly|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{]+)?\{)/gm,
  java: /^\s+(?:(?:public|private|protected|static|final|abstract|synchronized)\s+)*(?:<[^>]+>\s+)?[\w<>[\],.? ]+\s+([a-z]\w*)\s*\([^;]*\)\s*(?:throws [\w., ]+)?\s*\{/gm,
  csharp: /^\s+(?:(?:public|private|protected|internal|static|async|override|virtual|sealed)\s+)+[\w<>[\],.? ]+\s+([A-Z]\w*)\s*\([^;]*\)\s*(?:where [^{]+)?\{?\s*$/gm,
};

const TYPE_PATTERNS = {
  python: /^\s*class\s+\w+/gm,
  ruby: /^\s*(?:class|module)\s+[A-Z]\w*/gm,
  go: /^type\s+\w+\s+(?:struct|interface|\w)/gm,
  rust: /^\s*(?:pub(?:\([^)]*\))?\s+)?(?:struct|enum|trait|type)\s+\w+/gm,
  javascript: /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:class|interface|type)\s+\w+/gm,
  java: /^\s*(?:(?:public|private|protected|static|final|abstract|sealed)\s+)*(?:class|interface|enum|record)\s+\w+/gm,
  csharp: /^\s*(?:(?:public|private|protected|internal|static|sealed|abstract|partial|readonly)\s+)*(?:class|interface|enum|record|struct)\s+\w+/gm,
};

export function structure(relativePath, source) {
  const lexed = lexFile(relativePath, source);
  const family = lexed?.family ?? familyOf(detectLanguage(relativePath)?.id);
  const code = lexed ? lexed.masked : source;
  const functionPattern = FUNCTION_PATTERNS[family];
  const typePattern = TYPE_PATTERNS[family];
  const functions = functionPattern ? [...code.matchAll(functionPattern)].map((match) => match.slice(1).find(Boolean)).filter(Boolean) : [];
  const types = typePattern ? (code.match(typePattern) ?? []).length : 0;
  const identifiers = [...new Set(code.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? [])];
  return { family, functions, types, identifiers, code };
}

const CONVENTIONAL_SHORT = new Set(['i', 'j', 'k', 'x', 'y', 'z', 'n', 'e', 'id', 'ok', 'db', 'io', 'fs', 't', '_', 'tx', 'rx', 'wg', 'mu', 'ctx', 'err', 'url', 'w', 'r']);

export function identifierQuality(identifiers) {
  const candidates = identifiers.filter((name) => !/^[A-Z_]+$/.test(name) || name.length > 1);
  if (candidates.length === 0) return { meanLength: 0, crypticShare: 0 };
  const cryptic = candidates.filter((name) => name.length <= 2 && !CONVENTIONAL_SHORT.has(name));
  return { meanLength: candidates.reduce((sum, name) => sum + name.length, 0) / candidates.length, crypticShare: cryptic.length / candidates.length };
}

function controlProfile(code) {
  return {
    control: (code.match(CONTROL) ?? []).length + (code.match(ELSE_BRANCH) ?? []).length,
    earlyReturns: (code.match(/^\s+(?:return|raise|throw|continue|break)\b/gm) ?? []).length,
  };
}

export function classifyRevision(relativePath, rejected, accepted) {
  const strippedRejected = stripComments(relativePath, rejected, { keepDirectives: true, stripDocstrings: false }).text;
  const strippedAccepted = stripComments(relativePath, accepted, { keepDirectives: true, stripDocstrings: false }).text;
  const normalize = (text) => text.replace(/\s+/g, ' ').trim();
  if (normalize(strippedRejected) === normalize(strippedAccepted)) return { labels: ['comment deletion only'], primary: 'comment deletion only' };
  const before = structure(relativePath, strippedRejected);
  const after = structure(relativePath, strippedAccepted);
  const labels = [];
  const newFunctions = after.functions.filter((name) => !before.functions.includes(name));
  if (after.types > before.types) labels.push('type or domain modeling improvement');
  if (newFunctions.length > 0) {
    const singleUse = newFunctions.filter((name) => (after.code.match(new RegExp(`\\b${name.replace(/[$]/g, '\\$')}\\b`, 'g')) ?? []).length <= 2);
    const tiny = strippedAccepted.split('\n').length < strippedRejected.split('\n').length * 0.9;
    labels.push(singleUse.length === newFunctions.length && !tiny && newFunctions.length >= 2 ? 'unnecessary abstraction' : 'function decomposition');
  }
  const controlBefore = controlProfile(before.code);
  const controlAfter = controlProfile(after.code);
  if (controlBefore.control !== controlAfter.control || controlBefore.earlyReturns !== controlAfter.earlyReturns) labels.push('control flow improvement');
  const renamed = after.identifiers.filter((name) => !before.identifiers.includes(name) && !newFunctions.includes(name));
  const dropped = before.identifiers.filter((name) => !after.identifiers.includes(name));
  if (renamed.length > 0 && dropped.length > 0) labels.push('identifier improvement');
  if (labels.length === 0) labels.push('other changes');
  const priority = [
    'unnecessary abstraction',
    'type or domain modeling improvement',
    'function decomposition',
    'control flow improvement',
    'identifier improvement',
    'other changes',
  ];
  return { labels, primary: priority.find((label) => labels.includes(label)) };
}
