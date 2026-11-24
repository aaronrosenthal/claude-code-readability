import { normalizeCommentText, similarity } from './words.mjs';

function docLineFlavor(comment) {
  const text = comment.text;
  if (text.startsWith('////')) return '//';
  if (text.startsWith('///')) return '///';
  if (text.startsWith('//!')) return '//!';
  if (text.startsWith("#'")) return "#'";
  if (text.startsWith('---')) return '---';
  return comment.marker;
}

function isGroupable(comment) {
  return comment.style === 'line' && comment.ownLine && !comment.codeAfter;
}

export function groupComments(comments) {
  const units = [];
  let current = null;
  for (const comment of comments) {
    const groupable = isGroupable(comment);
    const continues = groupable && current?.groupable && current.language === comment.language && current.flavor === docLineFlavor(comment) && comment.line === current.endLine + 1;
    if (continues) {
      current.items.push(comment);
      current.endLine = comment.endLine;
      current.end = comment.end;
      continue;
    }
    current = {
      type: 'comment',
      items: [comment],
      groupable,
      flavor: docLineFlavor(comment),
      language: comment.language,
      line: comment.line,
      endLine: comment.endLine,
      start: comment.start,
      end: comment.end,
    };
    units.push(current);
  }
  return units;
}

function bracketDepths(masked, offsets) {
  const depths = new Map();
  const sorted = [...offsets].sort((a, b) => a - b);
  let depth = 0;
  let cursor = 0;
  for (const offset of sorted) {
    for (; cursor < offset; cursor++) {
      const ch = masked[cursor];
      if (ch === '(' || ch === '[' || ch === '{') depth++;
      else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    }
    depths.set(offset, depth);
  }
  return depths;
}

function previousSignificant(masked, offset) {
  let j = offset - 1;
  while (j >= 0 && /\s/.test(masked[j])) j--;
  return j;
}

function lineAt(source, offset) {
  const start = source.lastIndexOf('\n', offset - 1) + 1;
  let end = source.indexOf('\n', offset);
  if (end === -1) end = source.length;
  return source.slice(start, end);
}

function enclosingPythonScope(masked, offset) {
  const lineStart = masked.lastIndexOf('\n', offset - 1) + 1;
  let indent = /^[ \t]*/.exec(masked.slice(lineStart))[0].length;
  let cursor = lineStart - 1;
  while (cursor > 0 && indent > 0) {
    const start = masked.lastIndexOf('\n', cursor - 1) + 1;
    const line = masked.slice(start, cursor);
    cursor = start - 1;
    if (!line.trim()) continue;
    const lineIndent = /^[ \t]*/.exec(line)[0].length;
    if (lineIndent >= indent) continue;
    if (/^\s*class\b/.test(line)) return 'class';
    if (/^\s*(?:async\s+)?def\b/.test(line)) return 'function';
    indent = lineIndent;
  }
  return 'module';
}

export function findPythonStringStatements(source, lexed) {
  const statements = [];
  const candidates = lexed.strings.filter((string) => {
    const before = source.slice(source.lastIndexOf('\n', string.start - 1) + 1, string.start);
    if (!/^[ \t]*[rRuUbBfFtT]{0,2}$/.test(before)) return false;
    let lineEnd = lexed.masked.indexOf('\n', string.end);
    if (lineEnd === -1) lineEnd = lexed.masked.length;
    return lexed.masked.slice(string.end, lineEnd).trim() === '';
  });
  const depths = bracketDepths(
    lexed.masked,
    candidates.map((string) => string.start),
  );
  for (const string of candidates) {
    if (depths.get(string.start) !== 0) continue;
    const previous = previousSignificant(lexed.masked, string.start - (source.slice(string.start - 2, string.start).match(/[rRuUbBfFtT]*$/)?.[0].length ?? 0));
    const previousChar = previous >= 0 ? lexed.masked[previous] : null;
    if (previousChar === '\\' || previousChar === ',' || previousChar === '=' || previousChar === '+' || previousChar === '(') continue;
    const text = source.slice(string.start, string.end);
    const quote = /^[rRuUbBfFtT]*("""|'''|"|')/.exec(text)?.[1] ?? '"';
    const inner = text.replace(/^[rRuUbBfFtT]*/, '').slice(quote.length, -quote.length);
    let position = 'statement';
    let headerLine = null;
    if (previousChar === null) position = 'module';
    else if (previousChar === ':') {
      headerLine = lineAt(lexed.masked, previous).trim();
      position = /^(?:async\s+def|def|class)\b/.test(headerLine) ? 'definition' : 'statement';
      if (position === 'definition') headerLine = lineAt(source, previous);
    } else {
      const previousLine = lineAt(lexed.masked, previous).trim();
      const isAssignment = /^[\w.]+\s*(?::[^=]+)?=/.test(previousLine) || /^[\w.]+\s*:\s*[^=]+$/.test(previousLine);
      if (isAssignment && enclosingPythonScope(lexed.masked, string.start) !== 'function') position = 'attribute';
    }
    statements.push({
      type: 'docstring',
      items: [{ start: string.start, end: string.end, text, body: inner.trim(), line: lexed.lines.lineOf(string.start), marker: quote }],
      position,
      headerLine,
      language: 'python',
      line: lexed.lines.lineOf(string.start),
      endLine: lexed.lines.lineOf(Math.max(string.start, string.end - 1)),
      start: string.start,
      end: string.end,
      flavor: 'docstring',
      formatted: /^[rRuUbB]*[fFtT]/.test(text),
    });
  }
  return statements;
}

function itemKey(unit, item) {
  return `${unit.type}|${unit.flavor}|${normalizeCommentText(item.text)}`;
}

export function markNewItems(beforeUnits, afterUnits) {
  const available = new Map();
  for (const unit of beforeUnits) {
    for (const item of unit.items) {
      const key = itemKey(unit, item);
      available.set(key, (available.get(key) ?? 0) + 1);
    }
  }
  for (const unit of afterUnits) {
    unit.newItems = [];
    for (const item of unit.items) {
      const key = itemKey(unit, item);
      const count = available.get(key) ?? 0;
      if (count > 0) available.set(key, count - 1);
      else unit.newItems.push(item);
    }
    unit.isNew = unit.newItems.length > 0;
    unit.isEntirelyNew = unit.newItems.length === unit.items.length;
  }
  const remaining = new Map(available);
  const removedUnits = beforeUnits.filter((unit) =>
    unit.items.every((item) => {
      const key = itemKey(unit, item);
      const count = remaining.get(key) ?? 0;
      if (count > 0) {
        remaining.set(key, count - 1);
        return true;
      }
      return false;
    }),
  );
  return { removedUnits };
}

export function unitBody(unit) {
  return unit.items
    .map((item) => item.body)
    .join('\n')
    .trim();
}

export function pairModifiedUnits(removedUnits, newUnits, threshold = 0.5) {
  const used = new Set();
  for (const unit of newUnits) {
    if (!unit.isEntirelyNew) continue;
    let best = null;
    let bestScore = threshold;
    for (const removed of removedUnits) {
      if (used.has(removed) || removed.type !== unit.type || removed.flavor !== unit.flavor) continue;
      const score = similarity(unitBody(removed), unitBody(unit));
      if (score >= bestScore) {
        best = removed;
        bestScore = score;
      }
    }
    if (best) {
      used.add(best);
      unit.modifiedFrom = best;
    }
  }
}
