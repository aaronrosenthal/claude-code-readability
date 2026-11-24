import { effectiveConfigFor, excludePatterns } from '../config/config.mjs';
import { matchesAny } from '../config/glob.mjs';
import { documentationSuppressionConstructs, isDocumentationRule } from '../directives/documentation-rules.mjs';
import { SCOPE_RANK } from '../directives/grammar.mjs';
import { definitionsFor, NEAR_MISS_KEYWORDS } from '../directives/registry.mjs';
import { detectLanguage, detectLanguageFromShebang, familyOf } from '../lexer/languages.mjs';
import { lexSource } from '../lexer/lex.mjs';
import { detectDeclaration, isExposed } from './declarations.mjs';
import { findPythonStringStatements, groupComments, markNewItems, pairModifiedUnits, unitBody } from './units.mjs';
import { contentWords, identifierWords, overlapRatio, wordCount } from './words.mjs';

const HASH_SEGMENT_FAMILIES = new Set(['python', 'ruby', 'shell', 'yaml', 'toml', 'r', 'elixir', 'dockerfile', 'hcl']);
const DOC_BLOCK_FAMILIES = new Set(['javascript', 'typescript', 'java', 'kotlin', 'php', 'csharp', 'c', 'cpp', 'swift', 'dart', 'rust', 'go', 'scss', 'css']);
const TRIPLE_SLASH_DOC_FAMILIES = new Set(['rust', 'csharp', 'swift', 'dart', 'c', 'cpp']);
const LICENSE_PATTERN =
  /\b(?:copyright|licen[cs]ed under|permission is hereby granted|all rights reserved|SPDX-License-Identifier|@license|apache license|mit license|gnu (?:general|lesser) public license|mozilla public license)\b|\(c\)\s*\d{4}|©/i;
const EXTERNAL_REFERENCE_PATTERN =
  /https?:\/\/\S+|\b(?:issue|bug|ticket|pr|pull request|incident)\s*#?\d+\b|\bGH-\d+\b|\b[A-Z][A-Z0-9]{1,9}-\d+\b|\bCVE-\d{4}-\d{4,}\b|\bRFC\s?\d{3,5}\b|\bGHSA(?:-[\w]{4}){3}\b/i;
const TASK_MARKER = /^(TODO|FIXME|HACK|XXX|NOTE|BUG|OPTIMIZE|REVIEW)\b[:(]?/i;
const GENERIC_DOC_WORDS = new Set(
  [
    'get',
    'set',
    'return',
    'create',
    'make',
    'build',
    'handle',
    'process',
    'run',
    'perform',
    'calculate',
    'compute',
    'check',
    'update',
    'delete',
    'remove',
    'add',
    'new',
    'init',
    'initialize',
    'instance',
    'class',
    'method',
    'function',
    'object',
    'value',
    'data',
    'given',
    'provided',
    'specified',
    'helper',
    'utility',
    'represent',
    'constructor',
    'construct',
    'default',
    'field',
    'property',
    'variable',
    'type',
    'interface',
    'struct',
    'module',
    'file',
    'gets',
    'sets',
    'returns',
    'creates',
    'param',
    'parameter',
    'argument',
    'arg',
    'result',
    'list',
    'string',
    'number',
    'int',
    'integer',
    'boolean',
    'bool',
    'array',
    'map',
    'dict',
    'item',
    'element',
    'simple',
    'basic',
    'main',
    'logic',
  ].map((word) => word.replace(/s$/, '')),
);

const OPTIONAL_DIRECTIVES = {
  'xcode-mark': { families: ['swift', 'c', 'cpp'], pattern: /^MARK:\s*-?\s*\S.{0,60}$/ },
  'vscode-region': { families: null, pattern: /^#?(?:end)?region\b.{0,60}$/i },
};

function relativeTo(root, filePath) {
  if (!root) return filePath.replace(/\\/g, '/');
  const normalizedRoot = root.replace(/\\/g, '/').replace(/\/$/, '');
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.startsWith(`${normalizedRoot}/`) ? normalized.slice(normalizedRoot.length + 1) : normalized;
}

function firstCodeOffset(lexed) {
  const match = /\S/.exec(lexed.masked);
  return match ? match.index : lexed.masked.length;
}

function nextCodeLines(lexed, afterOffset, limit = 3) {
  const lines = [];
  let cursor = lexed.masked.indexOf('\n', afterOffset);
  while (cursor !== -1 && lines.length < limit) {
    const next = lexed.masked.indexOf('\n', cursor + 1);
    const line = lexed.masked.slice(cursor + 1, next === -1 ? undefined : next);
    if (line.trim() !== '') lines.push({ text: line, lineNumber: lexed.lines.lineOf(cursor + 1) });
    if (next === -1) break;
    cursor = next;
  }
  return lines;
}

function codeOnSameLine(lexed, offset) {
  const start = lexed.masked.lastIndexOf('\n', offset - 1) + 1;
  let end = lexed.masked.indexOf('\n', offset);
  if (end === -1) end = lexed.masked.length;
  return lexed.masked.slice(start, end);
}

function isAnnotationLine(line) {
  return /^\s*(?:@[\w.]+(?:\(.*\))?|#!?\[.*\]|\[[\w.]+(?:\(.*\))?\])\s*$/.test(line);
}

function declarationAfter(lexed, unit, family) {
  const candidates = nextCodeLines(lexed, unit.end, 6);
  if (candidates.length === 0) return null;
  let expectedLine = unit.endLine + 1;
  for (const candidate of candidates) {
    if (candidate.lineNumber !== expectedLine) return null;
    if (isAnnotationLine(candidate.text)) {
      expectedLine++;
      continue;
    }
    return detectDeclaration(family, candidate.text);
  }
  return null;
}

function isDocCommentUnit(unit, family) {
  const first = unit.items[0];
  const text = first.text;
  if (family === 'python') return false;
  if (family === 'r') return text.startsWith("#'");
  if (family === 'lua') return text.startsWith('---');
  if (DOC_BLOCK_FAMILIES.has(family) && first.style === 'block') {
    if (/^\/\*\*(?!\/)/.test(text) && text !== '/**/' && !text.startsWith('/***')) return true;
    if ((family === 'rust' || family === 'c' || family === 'cpp') && text.startsWith('/*!')) return true;
  }
  if (first.style === 'line') {
    if (text.startsWith('///') && !text.startsWith('////') && (TRIPLE_SLASH_DOC_FAMILIES.has(family) || family === 'kotlin')) return true;
    if (text.startsWith('//!') && (family === 'rust' || family === 'c' || family === 'cpp')) return true;
  }
  return false;
}

function isConventionalDocUnit(unit, family, lexed) {
  if (family !== 'go' && family !== 'ruby') return false;
  if (unit.items[0].style !== 'line' || !unit.groupable) return false;
  return declarationAfter(lexed, unit, family) !== null;
}

function moduleLevelDoc(unit, family, header) {
  const text = unit.items[0].text;
  if (family === 'rust' && (text.startsWith('//!') || text.startsWith('/*!'))) return true;
  if (family === 'go' && /^Package\s+\w+/.test(unit.items[0].body)) return true;
  if (header && /@(?:file|fileoverview|module|packageDocumentation|overview)\b/.test(unitBody(unit))) return true;
  return false;
}

function isTypeOnlyDoc(body, family) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const typeTag =
    family === 'php'
      ? /^@(?:var|param|return|throws|template(?:-covariant|-contravariant)?|extends|implements|use|property(?:-read|-write)?|method|mixin|phpstan-[\w-]+|psalm-[\w-]+|param-out|readonly|immutable|pure|SuppressWarnings|noinspection)\b/
      : /^@(?:type|typedef|template|satisfies|implements|extends|augments|enum|this|callback|overload|param\s+\{|returns?\s+\{|property\s+\{|import\b)/;
  return lines.every((line) => typeTag.test(line));
}

function docSummary(body) {
  return body
    .split('\n')
    .filter((line) => !/^\s*[@:\\]/.test(line) && !/^\s*<\/?\w+[^>]*>\s*$/.test(line))
    .join(' ')
    .replace(/<\/?\w+[^>]*>/g, ' ')
    .replace(/\{@\w+\s+([^}]*)\}/g, '$1')
    .trim();
}

function restatesDeclaration(body, declaration, nextCode) {
  const summary = docSummary(body);
  const words = contentWords(summary);
  const tagDescriptions = body
    .split('\n')
    .filter((line) => /^\s*@(?:param|returns?|throws|raises)\b/.test(line))
    .map((line) => line.replace(/^\s*@\w+\s*(?:\{[^}]*\}\s*)?[\w$.[\]]*\s*-?\s*/, ''));
  const substantiveTags = tagDescriptions.filter((description) => wordCount(description) >= 4);
  if (words.length === 0) return substantiveTags.length === 0;
  const nameWords = identifierWords(`${declaration?.name ?? ''} ${nextCode}`);
  const novel = words.filter((word) => !nameWords.has(word) && !GENERIC_DOC_WORDS.has(word));
  return novel.length === 0 && substantiveTags.length === 0;
}

function exceptionTag(body, config) {
  const match = /^([A-Z][A-Z_-]+)(?:\([^)]*\))?:\s*([\s\S]*)$/.exec(body.trim());
  if (!match || !config.exceptions.tags.includes(match[1])) return null;
  return { tag: match[1], content: match[2], substantive: wordCount(match[2]) >= config.exceptions.minWords };
}

function decorativeSeparator(body) {
  const stripped = body.replace(/\s/g, '');
  if (stripped.length === 0) return true;
  const symbols = (stripped.match(/[^\p{L}\p{N}]/gu) ?? []).length;
  if (symbols / stripped.length >= 0.7) return true;
  return /^[-=*#~_/+<>]{3,}\s*\S.{0,40}?\s*[-=*#~_/+<>]{3,}$/.test(body.trim());
}

function looksLikeCommentedOutCode(body, family) {
  const lines = body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return false;
  const codeLike = lines.filter(
    (line) =>
      /[;{}]$/.test(line) ||
      /^(?:if|for|while|return|const|let|var|def|class|import|from|function|func|fn|public|private|protected|static|await|async|elif|else|try|catch|except|switch|case)\b.*[({:;=]/.test(
        line,
      ) ||
      (/^[\w$.[\]]+\s*(?:=|\+=|-=|:=)\s*[^=].*$/.test(line) && !/\s(?:is|are|the|a|an|to)\s/.test(line)) ||
      /^[\w$.]+\([^)]*\)\s*;?$/.test(line),
  );
  return codeLike.length / lines.length >= 0.6 && family !== 'markdown';
}

function proseReason(unit, lexed, family) {
  const body = unitBody(unit);
  if (decorativeSeparator(body)) return { code: 'decorative-separator', text: 'decorative section separator' };
  if (looksLikeCommentedOutCode(body, family)) return { code: 'commented-out-code', text: 'commented-out code (version control keeps history; delete it)' };
  const task = TASK_MARKER.exec(body);
  if (/^(?:step\s*\d+|\d+[.)]\s)/i.test(body))
    return { code: 'numbered-step', text: 'numbered step narration; consider extracting well-named functions if the steps are distinct' };
  const first = unit.items[0];
  const sameLine = first.ownLine ? '' : codeOnSameLine(lexed, first.start);
  if (sameLine) {
    const declared = /\b(?:const|let|var|val|auto|int|float|double|string|bool|my|local)?\s*([A-Za-z_]\w{0,2})\s*(?::=|=(?!=))/.exec(sameLine);
    if (declared && !/^(?:i|j|k|_|id|ok|db|io|url|ctx)$/.test(declared[1])) {
      return { code: 'explains-name', text: `explains the unclear name "${declared[1]}"; a descriptive name would make the comment unnecessary` };
    }
    const literals = sameLine.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? [];
    const commentNumbers = new Set(body.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g) ?? []);
    const isMagic = (literal) => literal.length > 1 || commentNumbers.has(literal);
    if (literals.some((literal) => literal !== '0' && literal !== '1' && isMagic(literal)) && !/^\s*(?:import|#include)/.test(sameLine)) {
      return { code: 'explains-magic-value', text: 'explains a literal value; a named constant would say this in code' };
    }
  }
  const context =
    sameLine ||
    nextCodeLines(lexed, unit.end, 2)
      .map((line) => line.text)
      .join('\n');
  const overlap = overlapRatio(body.replace(TASK_MARKER, ''), context);
  if (overlap.total > 0 && overlap.ratio >= 0.5) {
    const shared = overlap.shared.slice(0, 4).join(', ');
    return { code: 'restates-code', text: `restates the code${sameLine ? ' on this line' : ' that follows'}${shared ? ` (shares: ${shared})` : ''}` };
  }
  if (task)
    return {
      code: 'task-marker',
      text: `${task[1].toUpperCase()} comment (task markers are not an exception; fix the issue now, or keep it with an exception tag if it records a real constraint)`,
    };
  return { code: 'explanatory', text: 'explanatory comment that the code could express itself' };
}

function matchCustomDirective(body, family, config) {
  for (const custom of config.directives.custom ?? []) {
    if (custom.languages && !custom.languages.includes(family)) continue;
    let pattern;
    try {
      pattern = new RegExp(custom.pattern, custom.flags ?? '');
    } catch {
      continue;
    }
    if (!pattern.test(body)) continue;
    const tool = custom.name ?? 'custom';
    if (custom.kind === 'suppression') {
      return {
        tool,
        toolKey: tool,
        url: custom.url ?? null,
        result: { kind: 'suppression', rules: [tool], blanket: false, scope: custom.scope ?? 'line', justification: null, trailing: '' },
      };
    }
    return { tool, toolKey: tool, url: custom.url ?? null, result: { kind: custom.kind ?? 'pragma', trailing: '' } };
  }
  for (const name of config.directives.optional ?? []) {
    const optional = OPTIONAL_DIRECTIVES[name];
    if (optional && (!optional.families || optional.families.includes(family)) && optional.pattern.test(body)) {
      return { tool: name, toolKey: name, url: null, result: { kind: 'pragma', trailing: '' } };
    }
  }
  return null;
}

function matchDirective(comment, body, raw, family, context, config) {
  const custom = matchCustomDirective(body, family, config);
  if (custom) return custom;
  for (const definition of definitionsFor(family)) {
    const result = definition.match({ body, raw, comment, family, context });
    if (result) return { tool: definition.tool, toolKey: definition.toolKey, url: definition.url, activation: definition.activation, result };
  }
  return null;
}

function segmentsOf(comment, family) {
  if (!HASH_SEGMENT_FAMILIES.has(family) || comment.style !== 'line') return [{ body: comment.body, raw: comment.afterMarker }];
  const parts = comment.afterMarker.split(/\s#\s?/);
  return parts.map((part, index) => ({ body: part.replace(index === 0 ? /^[#\s]*/ : /^\s*/, '').trim(), raw: index === 0 ? part : part.trim() }));
}

function nearMiss(body, raw) {
  for (const [tool, pattern] of NEAR_MISS_KEYWORDS) if (pattern.test(body) || pattern.test(raw)) return tool;
  return null;
}

function globMatch(rule, pattern) {
  if (pattern === rule) return true;
  if (!pattern.includes('*')) return false;
  return new RegExp(
    `^${pattern
      .split('*')
      .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&'))
      .join('.*')}$`,
  ).test(rule);
}

function listFor(map, toolKey) {
  return [...(map?.[toolKey] ?? []), ...(map?.['*'] ?? [])];
}

function authorizeSuppression(directive, config, adjacentJustification) {
  const { result, toolKey, tool } = directive;
  const policy = config.suppressions;
  const allowed = listFor(policy.allow, toolKey);
  const denied = listFor(policy.deny, toolKey);
  const rules = result.rules;
  const allowlisted = rules.length > 0 && !result.blanket && rules.every((rule) => allowed.some((pattern) => globMatch(rule, pattern)));
  const deniedRule = rules.length === 0 && denied.includes('*') ? '*' : rules.find((rule) => denied.some((pattern) => globMatch(rule, pattern)));
  if (deniedRule) return { ok: false, code: 'suppression-denied', text: `${tool} suppression of "${deniedRule}" is on this project's deny list` };
  const documentationRule = rules.find((rule) => isDocumentationRule(rule));
  if (documentationRule && !allowlisted) {
    return { ok: false, code: 'documentation-circumvention', text: `suppresses the documentation rule "${documentationRule}"; write the required documentation instead` };
  }
  if (allowlisted) return { ok: true, via: 'allowlist' };
  if (policy.new === 'allow') return { ok: true, via: 'policy' };
  if (policy.new === 'deny') {
    return { ok: false, code: 'suppression-not-authorized', text: `new ${tool} suppressions require an entry in suppressions.allow (strict mode)` };
  }
  if (result.blanket && !policy.allowBlanket) {
    return { ok: false, code: 'blanket-suppression', text: `blanket ${tool} suppression; name the specific rule${rules.length === 0 ? '' : 's'} instead of disabling everything` };
  }
  if (result.scope === 'file' && !policy.allowFileWide) {
    return { ok: false, code: 'file-wide-suppression', text: `file-wide ${tool} suppression; use the narrowest line-level form for the specific occurrence` };
  }
  const justification = result.justification || result.trailing || adjacentJustification;
  if (policy.requireJustification && wordCount(justification ?? '') < 3) {
    const syntax = result.justificationSyntax ? ` (${tool} accepts a reason via ${result.justificationSyntax})` : ' (put the reason in a comment directly above it)';
    return { ok: false, code: 'unjustified-suppression', text: `new ${tool} suppression without a justification${syntax}` };
  }
  return { ok: true, via: 'justified' };
}

function broadensExisting(directive, previous) {
  if (!previous) return false;
  const before = previous.result;
  const after = directive.result;
  if ((SCOPE_RANK[after.scope] ?? 1) > (SCOPE_RANK[before.scope] ?? 1)) return true;
  if (after.blanket && !before.blanket) return true;
  return after.rules.some((rule) => !before.rules.includes(rule)) && !before.blanket;
}

function finding(unit, item, category, reason, extras = {}) {
  return {
    line: item?.line ?? unit.line,
    endLine: unit.endLine,
    comment: (item?.text ?? unit.items[0].text).split('\n').slice(0, 6).join('\n'),
    category,
    reasonCode: reason.code,
    reason: reason.text,
    ...extras,
  };
}

function directiveIndex(units, family, config, headerEnd, dockerHeaderLines) {
  const map = new Map();
  for (const unit of units) {
    if (unit.type !== 'comment') continue;
    for (const item of unit.items) {
      const context = { inDockerDirectiveBlock: dockerHeaderLines.has(item.line), header: item.start < headerEnd };
      const segments = segmentsOf(item, family);
      const matches = segments.map((segment) => (segment.body ? matchDirective(item, segment.body, segment.raw, item.language ?? family, context, config) : null));
      map.set(item, { segments, matches });
    }
  }
  return map;
}

function dockerDirectiveLines(lexed, family) {
  const lines = new Set();
  if (family !== 'dockerfile') return lines;
  for (const comment of lexed.comments) {
    if (comment.line !== lines.size + 1) break;
    if (!/^#\s*\w+\s*=/.test(comment.text)) break;
    lines.add(comment.line);
  }
  return lines;
}

export function resolveLanguage(filePath, content) {
  return detectLanguage(filePath) ?? (content ? detectLanguageFromShebang(content) : null);
}

export function analyzeChange({ filePath, projectRoot, before, after, config: baseConfig, documentationRequirements = null }) {
  const relativePath = relativeTo(projectRoot, filePath);
  const language = resolveLanguage(filePath, after);
  if (!language) return { status: 'skipped', reason: 'unsupported file type', relativePath };
  const family = familyOf(language);
  const config = effectiveConfigFor(baseConfig, language.id, family);
  if (config.mode === 'off') return { status: 'skipped', reason: 'mode is off', relativePath };
  if (matchesAny(relativePath, excludePatterns(config))) return { status: 'skipped', reason: 'excluded path', relativePath };

  const lexedAfter = lexSource(after, language.id);
  if (!lexedAfter.ok) return { status: 'skipped', reason: `cannot parse reliably (${lexedAfter.reason})`, relativePath };
  const lexedBefore = before ? lexSource(before, language.id) : { ok: true, comments: [], strings: [], masked: '', lines: null };
  if (!lexedBefore.ok) return { status: 'skipped', reason: `cannot parse the original file reliably (${lexedBefore.reason})`, relativePath };

  const headerEnd = firstCodeOffset(lexedAfter);
  const afterUnits = groupComments(lexedAfter.comments);
  const beforeUnits = groupComments(lexedBefore.comments);
  if (family === 'python') {
    afterUnits.push(...findPythonStringStatements(after, lexedAfter));
    if (before) beforeUnits.push(...findPythonStringStatements(before, lexedBefore));
  }
  const generatedMarker = afterUnits.some(
    (unit) => unit.start < headerEnd + 1 && unit.items.some((item) => /Code generated .* DO NOT EDIT\.|@generated\b|<auto-generated/.test(item.text)),
  );
  if (generatedMarker) return { status: 'skipped', reason: 'generated file', relativePath };

  const { removedUnits } = markNewItems(beforeUnits, afterUnits);
  const newUnits = afterUnits.filter((unit) => unit.isNew).sort((a, b) => a.start - b.start);
  pairModifiedUnits(removedUnits, newUnits);

  const findings = [];
  const allowed = [];
  const notes = [];
  const directives = directiveIndex(afterUnits, family, config, headerEnd, dockerDirectiveLines(lexedAfter, family));
  const beforeDirectives = before ? directiveIndex(beforeUnits, family, config, firstCodeOffset(lexedBefore), dockerDirectiveLines(lexedBefore, family)) : new Map();
  const justifyingUnits = new Set();

  const proseUnits = [];
  for (const unit of newUnits) {
    if (unit.type === 'docstring') {
      proseUnits.push(unit);
      continue;
    }
    const proseItems = [];
    for (const item of unit.newItems) {
      const { segments, matches } = directives.get(item);
      if (item.style === 'shebang' || (family === 'python' && item.line <= 2 && /^[ \t\f]*#.*?coding[:=][ \t]*[-_.a-zA-Z0-9]+/.test(item.text))) {
        allowed.push({ line: item.line, category: 'directive', detail: item.style === 'shebang' ? 'shebang' : 'encoding declaration' });
        continue;
      }
      if (family === 'ruby' && item.start < headerEnd && /^(?:frozen_string_literal|encoding|coding|warn_indent|shareable_constant_value):\s*\S+/.test(item.body)) {
        allowed.push({ line: item.line, category: 'directive', detail: 'Ruby magic comment' });
        continue;
      }
      const directiveSegments = matches.filter(Boolean);
      if (directiveSegments.length === 0) {
        proseItems.push(item);
        continue;
      }
      const proseSegments = segments.filter((segment, index) => !matches[index] && segment.body).map((segment) => segment.body);
      for (const directive of directiveSegments) {
        if (directive.result.kind !== 'suppression') {
          allowed.push({ line: item.line, category: 'directive', detail: `${directive.tool} ${directive.result.kind}` });
          const trailing = [directive.result.trailing, ...proseSegments].filter((text) => wordCount(text) >= 3).join(' ');
          if (trailing) {
            findings.push(
              finding(unit, item, 'directive-prose', {
                code: 'directive-with-prose',
                text: `${directive.tool} directive carries explanatory prose ("${trailing.slice(0, 80)}"); directives must not double as explanations`,
              }),
            );
          }
          continue;
        }
        const previous = findPreviousDirective(unit, removedUnits, beforeDirectives, directive);
        if (previous && !broadensExisting(directive, previous)) {
          allowed.push({ line: item.line, category: 'directive', detail: `${directive.tool} suppression edited without broadening` });
          continue;
        }
        const adjacent = adjacentJustification(unit, afterUnits, item);
        const inlineJustification = proseSegments.join(' ');
        const effective =
          directive.result.scope === 'region' && !regionIsClosed(directives, item, directive.toolKey)
            ? { ...directive, result: { ...directive.result, scope: 'file' } }
            : directive;
        const authorization = authorizeSuppression(effective, config, [inlineJustification, adjacent?.text].filter(Boolean).join(' '));
        const decision =
          previous && authorization.via !== 'allowlist'
            ? {
                ok: false,
                code: 'broadens-suppression',
                text: `broadens an existing ${directive.tool} suppression (wider scope or more rules); keep the original suppression unchanged`,
              }
            : authorization;
        if (decision.ok) {
          allowed.push({ line: item.line, category: 'suppression', detail: `${directive.tool} (${decision.via})` });
          if (adjacent) justifyingUnits.add(adjacent.unit);
          if (directive.activation) notes.push(`${directive.tool}: ${directive.activation}`);
        } else {
          const category = previous ? 'suppression-broadened' : decision.code === 'documentation-circumvention' ? 'documentation-circumvention' : 'suppression';
          findings.push(finding(unit, item, category, { code: decision.code, text: decision.text }, { tool: directive.tool, docs: directive.url }));
        }
      }
    }
    if (proseItems.length > 0) {
      proseUnits.push(
        proseItems.length === unit.items.length
          ? unit
          : { ...unit, items: proseItems, line: proseItems[0].line, endLine: proseItems.at(-1).endLine, start: proseItems[0].start, end: proseItems.at(-1).end },
      );
    }
  }

  for (const unit of proseUnits) {
    const decision = classifyProse(unit, { lexed: lexedAfter, family, config, headerEnd, documentationRequirements, relativePath, justifyingUnits, directives });
    if (decision.allowed) allowed.push({ line: unit.line, category: decision.category, detail: decision.detail });
    else findings.push(finding(unit, unit.newItems?.[0] ?? unit.items[0], decision.category, decision.reason, decision.extras));
  }

  const constructFindings = documentationConstructFindings(family, before, after, lexedBefore, lexedAfter, config);
  findings.push(...constructFindings);

  return { status: 'analyzed', relativePath, language: language.id, family, tier: language.tier, mode: config.mode, findings, allowed, notes };
}

function regionIsClosed(directives, startItem, toolKey) {
  for (const [item, entry] of directives) {
    if (item.start <= startItem.start) continue;
    if (entry.matches.some((match) => match?.toolKey === toolKey && match.result.kind === 'suppression-end')) return true;
  }
  return false;
}

function findPreviousDirective(unit, removedUnits, beforeDirectives, directive) {
  const candidates = unit.modifiedFrom ? [unit.modifiedFrom, ...removedUnits] : removedUnits;
  for (const removed of candidates) {
    if (removed !== unit.modifiedFrom && Math.abs(removed.line - unit.line) > 3) continue;
    for (const item of removed.items) {
      const entry = beforeDirectives.get(item);
      const match = entry?.matches.find((candidate) => candidate && candidate.toolKey === directive.toolKey && candidate.result.kind === 'suppression');
      if (match) return match;
    }
  }
  return null;
}

function adjacentJustification(unit, afterUnits, item) {
  const index = afterUnits.indexOf(unit);
  const itemIndex = unit.items.indexOf(item);
  if (itemIndex > 0) {
    const previousLines = unit.items
      .slice(0, itemIndex)
      .map((line) => line.body)
      .join(' ');
    return wordCount(previousLines) >= 3 ? { unit: null, text: previousLines } : null;
  }
  const previous = afterUnits[index - 1];
  if (previous?.type !== 'comment' || !previous.items[0].ownLine || previous.endLine !== item.line - 1) return null;
  const text = unitBody(previous);
  return wordCount(text) >= 3 ? { unit: previous, text } : null;
}

function documentationTarget(unit, lexed, family, headerEnd) {
  if (unit.type === 'docstring') {
    if (unit.position === 'module') return { kind: 'module', name: null, visibility: 'public' };
    if (unit.position === 'definition') {
      const declaration = detectDeclaration('python', unit.headerLine ?? '');
      return declaration ?? { kind: 'function', name: null, visibility: 'public' };
    }
    if (unit.position === 'attribute') return { kind: 'property', name: null, visibility: 'public' };
    return null;
  }
  const header = unit.start < headerEnd;
  if (moduleLevelDoc(unit, family, header)) return { kind: 'module', name: null, visibility: 'public' };
  const declaration = declarationAfter(lexed, unit, family);
  if (declaration) return declaration;
  if (header && isDocCommentUnit(unit, family)) return { kind: 'module', name: null, visibility: 'public' };
  return null;
}

function classifyDocumentation(unit, target, context) {
  const { family, config, documentationRequirements, relativePath, lexed } = context;
  const body = unitBody(unit);
  const requirement = documentationRequirements?.requirementFor?.(family, target.kind, target.visibility, relativePath) ?? { status: 'not-required' };
  if (requirement.status === 'required') {
    return { allowed: true, category: 'documentation', detail: `required by ${requirement.source}` };
  }
  if (requirement.status === 'unknown') {
    return { allowed: true, category: 'documentation', detail: `documentation requirements could not be resolved (${requirement.source}); allowed by fallback` };
  }
  const policy = config.documentation[target.kind] ?? 'auto';
  if (policy === 'allow') return { allowed: true, category: 'documentation', detail: `documentation.${target.kind} is "allow"` };
  const nextCode = nextCodeLines(lexed, unit.end, 1)[0]?.text ?? '';
  const restates = restatesDeclaration(body, target, unit.type === 'docstring' ? (unit.headerLine ?? '') : nextCode);
  if (policy === 'restrict') {
    return {
      allowed: false,
      category: 'unnecessary-documentation',
      reason: { code: 'documentation-restricted', text: `documentation.${target.kind} is "restrict" in this project's readability config` },
    };
  }
  if (config.mode === 'balanced' && (isExposed(target.visibility) || target.kind === 'module') && !restates) {
    return { allowed: true, category: 'documentation', detail: `public API documentation for ${target.kind}` };
  }
  if (restates) {
    return {
      allowed: false,
      category: 'unnecessary-documentation',
      reason: {
        code: 'restates-declaration',
        text: `documentation restates the ${target.kind}${target.name ? ` name "${target.name}"` : ''} without adding information (contract, units, errors, invariants)`,
      },
    };
  }
  const why =
    config.mode === 'strict'
      ? 'strict mode allows documentation only when the project requires it, the config allows it, or it carries an exception tag'
      : `documentation on a non-public ${target.kind} that the project does not require`;
  return { allowed: false, category: 'unnecessary-documentation', reason: { code: 'documentation-not-required', text: why } };
}

function classifyProse(unit, context) {
  const { family, config, headerEnd, lexed, justifyingUnits } = context;
  const body = unitBody(unit);
  if (justifyingUnits.has(unit)) return { allowed: true, category: 'justification', detail: 'explains an adjacent suppression' };
  if (unit.type === 'comment' && unit.items[0].text.startsWith('/*!') && (family === 'javascript' || family === 'typescript' || family === 'css')) {
    return { allowed: true, category: 'license', detail: 'legal comment preserved by bundlers' };
  }
  if (config.exceptions.allowLicenseHeaders && LICENSE_PATTERN.test(body) && (unit.start <= headerEnd || /@license|SPDX-License-Identifier/.test(body))) {
    return { allowed: true, category: 'license', detail: 'license or copyright notice' };
  }
  const tag = exceptionTag(body, config);
  if (tag?.substantive) return { allowed: true, category: 'semantic-exception', detail: `${tag.tag}: exception tag` };
  if (tag && !tag.substantive) {
    return {
      allowed: false,
      category: 'unnecessary',
      reason: { code: 'thin-exception', text: `${tag.tag}: exception tag needs at least ${config.exceptions.minWords} words of information that the code cannot express` },
    };
  }
  if (unit.modifiedFrom) return { allowed: true, category: 'modified-existing', detail: 'edits an existing comment' };
  if (!unit.isEntirelyNew && unit.type === 'comment') {
    const addedText = unit.newItems.map((item) => item.body).join(' ');
    if (wordCount(addedText) <= 3) return { allowed: true, category: 'modified-existing', detail: 'minor change to an existing comment' };
  }
  if (config.exceptions.allowExternalReferences && EXTERNAL_REFERENCE_PATTERN.test(body)) {
    return { allowed: true, category: 'external-reference', detail: 'references an external issue, specification, or advisory' };
  }
  const isDoc = unit.type === 'docstring' ? unit.position !== 'statement' : isDocCommentUnit(unit, family) || isConventionalDocUnit(unit, family, lexed);
  if (isDoc) {
    if (isTypeOnlyDoc(body, family) && (family === 'javascript' || family === 'php')) {
      return { allowed: true, category: 'directive', detail: 'machine-consumed type annotation' };
    }
    const target = documentationTarget(unit, lexed, family, headerEnd);
    if (target) return classifyDocumentation(unit, target, context);
    if (unit.type === 'docstring' && unit.formatted) return { allowed: true, category: 'string', detail: 'formatted string statement' };
  }
  if (unit.type === 'docstring' && unit.position === 'statement') {
    return { allowed: false, category: 'unnecessary', reason: { code: 'bare-string-comment', text: 'bare string literal used as a comment' } };
  }
  const first = unit.items[0];
  if (unit.items.length === 1) {
    const tool = nearMiss(first.body ?? '', first.afterMarker ?? '');
    if (tool) {
      return {
        allowed: false,
        category: 'malformed-directive',
        reason: { code: 'malformed-directive', text: `looks like a ${tool} directive but does not match its documented syntax, so the tool will ignore it` },
      };
    }
  }
  return { allowed: false, category: 'unnecessary', reason: proseReason(unit, lexed, family) };
}

function stripComments(source, lexed) {
  if (!source || !lexed?.ok) return '';
  let output = '';
  let cursor = 0;
  for (const comment of lexed.comments) {
    output += source.slice(cursor, comment.start);
    output += source.slice(comment.start, comment.end).replace(/[^\n]/g, ' ');
    cursor = comment.end;
  }
  return output + source.slice(cursor);
}

function documentationConstructFindings(family, before, after, lexedBefore, lexedAfter, config) {
  if (config.mode === 'advisory') return [];
  const beforeConstructs = documentationSuppressionConstructs(family, stripComments(before, lexedBefore));
  const afterConstructs = documentationSuppressionConstructs(family, stripComments(after, lexedAfter));
  const remaining = new Map();
  for (const construct of beforeConstructs) remaining.set(construct.text + construct.rule, (remaining.get(construct.text + construct.rule) ?? 0) + 1);
  const findings = [];
  for (const construct of afterConstructs) {
    const key = construct.text + construct.rule;
    if ((remaining.get(key) ?? 0) > 0) {
      remaining.set(key, remaining.get(key) - 1);
      continue;
    }
    const allowedRules = listFor(config.suppressions.allow, family);
    if (allowedRules.some((pattern) => globMatch(construct.rule, pattern))) continue;
    findings.push({
      line: lexedAfter.lines.lineOf(construct.offset),
      endLine: lexedAfter.lines.lineOf(construct.offset),
      comment: construct.text,
      category: 'documentation-circumvention',
      reasonCode: 'documentation-circumvention',
      reason: `suppresses the documentation rule "${construct.rule}" in code; write the required documentation instead`,
    });
  }
  return findings;
}
