import { isIdentifierChar, isWhitespace, UnreliableParse } from './scanner.mjs';

const JS_REGEX_PRECEDING_KEYWORDS = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'extends']);

function expressionCanStartHere(s, keywords = JS_REGEX_PRECEDING_KEYWORDS) {
  if (s.lastToken === null || s.lastToken === 'punct') return true;
  return s.lastToken === 'word' && keywords.has(s.lastWord);
}

function consumeRegexLiteral(s) {
  const start = s.i;
  let j = s.i + 1;
  let inClass = false;
  while (j < s.src.length) {
    const ch = s.src[j];
    if (ch === '\n') throw new UnreliableParse('unterminated regular expression', start);
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === '[') inClass = true;
    else if (ch === ']') inClass = false;
    else if (ch === '/' && !inClass) {
      j++;
      while (isIdentifierChar(s.src[j])) j++;
      s.i = j;
      s.recordString(start, j, { regex: true });
      return;
    }
    j++;
  }
  throw new UnreliableParse('unterminated regular expression', start);
}

function looksLikeTypeParameterList(s) {
  const rest = s.src.slice(s.i + 1, s.i + 80);
  return /^\s*[A-Za-z_$][\w$]*\s*(,|extends\b|=)/.test(rest);
}

function consumeJsxTagBody(s) {
  while (!s.atEnd()) {
    if (s.startsWith('/>')) {
      s.i += 2;
      return 'self-closing';
    }
    const ch = s.peek();
    if (ch === '>') {
      s.i++;
      return 'open';
    }
    if (ch === '{') {
      s.i++;
      s.scanUntilClose('}', '{');
      continue;
    }
    if (ch === '"' || ch === "'") {
      s.consumeQuoted(ch, { escape: null });
      continue;
    }
    if (s.startsWith('//')) {
      s.consumeLineComment(2);
      continue;
    }
    if (s.startsWith('/*')) {
      s.consumeBlockComment('/*', '*/');
      continue;
    }
    s.i++;
  }
  throw new UnreliableParse('unterminated JSX tag', s.i);
}

function consumeJsxChildren(s) {
  while (!s.atEnd()) {
    if (s.startsWith('</')) {
      const close = s.src.indexOf('>', s.i);
      if (close === -1) throw new UnreliableParse('unterminated JSX closing tag', s.i);
      s.i = close + 1;
      return;
    }
    const ch = s.peek();
    if (ch === '<') {
      consumeJsxElement(s);
      continue;
    }
    if (ch === '{') {
      s.i++;
      s.scanUntilClose('}', '{');
      continue;
    }
    s.i++;
  }
  throw new UnreliableParse('unterminated JSX element', s.i);
}

function consumeJsxElement(s) {
  s.i++;
  if (s.peek() === '>') {
    s.i++;
    consumeJsxChildren(s);
    return;
  }
  while (/[\w$.:-]/.test(s.peek() ?? '')) s.i++;
  if (consumeJsxTagBody(s) === 'open') consumeJsxChildren(s);
}

function jsxCanStartHere(s) {
  if (!expressionCanStartHere(s)) return false;
  const next = s.peek(1);
  if (next === '>') return true;
  if (!/[A-Za-z]/.test(next ?? '')) return false;
  return !looksLikeTypeParameterList(s);
}

function slashSlashAndBlock(s, { nestedBlocks = false } = {}) {
  if (s.startsWith('//')) {
    s.consumeLineComment(2);
    return true;
  }
  if (s.startsWith('/*')) {
    s.consumeBlockComment('/*', '*/', { nests: nestedBlocks });
    return true;
  }
  return false;
}

function quoteAt(s, quotes) {
  for (const quote of quotes) if (s.startsWith(quote)) return quote;
  return null;
}

export function javascriptProfile({ jsx = false } = {}) {
  const template = { open: '${', close: '}', openBracket: '{' };
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (slashSlashAndBlock(s)) return true;
      const ch = s.peek();
      if (ch === '"' || ch === "'") {
        s.consumeQuoted(ch, { multiline: false });
        return true;
      }
      if (ch === '`') {
        s.consumeQuoted('`', { interpolation: template });
        return true;
      }
      if (ch === '/' && expressionCanStartHere(s)) {
        consumeRegexLiteral(s);
        return true;
      }
      if (jsx && ch === '<' && jsxCanStartHere(s)) {
        consumeJsxElement(s);
        s.noteCode('close');
        return true;
      }
      return false;
    },
  };
}

const PYTHON_STRING_PREFIX = /^(?:[rRuUbBfFtT]|[rR][bBfFtT]|[bBfFtT][rR])$/;

function consumePythonString(s, prefix) {
  const isFormatted = /[fFtT]/.test(prefix);
  const quote = quoteAt(s, ['"""', "'''", '"', "'"]);
  const interpolation = isFormatted ? { open: '{', close: '}', openBracket: '{', escapedBy: '{{' } : null;
  s.consumeQuoted(quote, { multiline: quote.length === 3, interpolation, prefixLength: prefix.length });
}

export function pythonProfile() {
  return {
    step(s) {
      const ch = s.peek();
      if (ch === '#') {
        s.consumeLineComment(1, s.i === 0 && s.startsWith('#!') ? 'shebang' : 'line');
        return true;
      }
      if (ch === '"' || ch === "'") {
        consumePythonString(s, '');
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      const next = s.peek();
      if ((next === '"' || next === "'") && PYTHON_STRING_PREFIX.test(word)) {
        consumePythonString(s, word);
        return true;
      }
      return false;
    },
  };
}

function consumeRustRawString(s, prefixLength) {
  const start = s.i - prefixLength;
  let hashes = 0;
  while (s.src[s.i + hashes] === '#') hashes++;
  if (s.src[s.i + hashes] !== '"') return false;
  const terminator = `"${'#'.repeat(hashes)}`;
  const end = s.src.indexOf(terminator, s.i + hashes + 1);
  if (end === -1) throw new UnreliableParse('unterminated raw string', start);
  s.i = end + terminator.length;
  s.recordString(start, s.i, { raw: true });
  return true;
}

function consumeRustCharOrLifetime(s) {
  const start = s.i;
  if (s.peek(1) === '\\') {
    const end = s.src.indexOf("'", s.i + 3);
    if (end === -1 || end - start > 12) throw new UnreliableParse('unterminated char literal', start);
    s.i = end + 1;
    s.recordString(start, s.i, { char: true });
    return;
  }
  const codePoint = s.src.codePointAt(s.i + 1);
  const width = codePoint > 0xffff ? 2 : 1;
  if (s.src[s.i + 1 + width] === "'") {
    s.i += 2 + width;
    s.recordString(start, s.i, { char: true });
    return;
  }
  s.i++;
  s.noteCode('punct', "'");
}

export function rustProfile() {
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!') && !s.startsWith('#![')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (slashSlashAndBlock(s, { nestedBlocks: true })) return true;
      const ch = s.peek();
      if (ch === '"') {
        s.consumeQuoted('"');
        return true;
      }
      if (ch === "'") {
        consumeRustCharOrLifetime(s);
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      const next = s.peek();
      if ((word === 'r' || word === 'br' || word === 'cr') && (next === '#' || next === '"')) {
        return consumeRustRawString(s, word.length);
      }
      if ((word === 'b' || word === 'c') && next === '"') {
        s.consumeQuoted('"', { prefixLength: 1 });
        return true;
      }
      if (word === 'b' && next === "'") {
        consumeRustCharOrLifetime(s);
        return true;
      }
      return false;
    },
  };
}

export function goProfile() {
  return {
    step(s) {
      if (slashSlashAndBlock(s)) return true;
      const ch = s.peek();
      if (ch === '"') {
        s.consumeQuoted('"', { multiline: false });
        return true;
      }
      if (ch === "'") {
        s.consumeQuoted("'", { multiline: false });
        return true;
      }
      if (ch === '`') {
        s.consumeQuoted('`', { escape: null });
        return true;
      }
      return false;
    },
  };
}

function consumeCppRawString(s, prefixLength) {
  const start = s.i - prefixLength;
  const open = s.src.indexOf('(', s.i + 1);
  if (open === -1 || open - s.i > 18) throw new UnreliableParse('malformed raw string', start);
  const delimiter = s.src.slice(s.i + 1, open);
  const terminator = `)${delimiter}"`;
  const end = s.src.indexOf(terminator, open);
  if (end === -1) throw new UnreliableParse('unterminated raw string', start);
  s.i = end + terminator.length;
  s.recordString(start, s.i, { raw: true });
  return true;
}

function consumeContinuedLineComment(s) {
  const start = s.i;
  let j = s.i;
  while (j < s.src.length) {
    const newline = s.src.indexOf('\n', j);
    if (newline === -1) {
      j = s.src.length;
      break;
    }
    const lineEnd = s.src[newline - 1] === '\r' ? newline - 1 : newline;
    if (s.src[lineEnd - 1] !== '\\') {
      j = lineEnd;
      break;
    }
    j = newline + 1;
  }
  s.recordComment(start, j, 'line', { markerLength: 2 });
  s.i = j;
}

export function cFamilyProfile({ cpp = true } = {}) {
  return {
    step(s) {
      if (s.startsWith('//')) {
        consumeContinuedLineComment(s);
        return true;
      }
      if (s.startsWith('/*')) {
        s.consumeBlockComment('/*', '*/');
        return true;
      }
      const ch = s.peek();
      if (ch === '#' && s.isLineStart()) {
        const include = /^#\s*(?:include|import)\s*</.exec(s.src.slice(s.i, s.i + 40));
        if (include) {
          const close = s.src.indexOf('>', s.i);
          const lineEnd = s.src.indexOf('\n', s.i);
          if (close !== -1 && (lineEnd === -1 || close < lineEnd)) {
            s.i = close + 1;
            s.noteCode('close');
            return true;
          }
        }
        return false;
      }
      if (ch === '"') {
        s.consumeQuoted('"', { multiline: false });
        return true;
      }
      if (ch === "'") {
        if (cpp && s.lastToken === 'number' && /[0-9a-fA-F]/.test(s.peek(1) ?? '')) {
          s.i++;
          return true;
        }
        s.consumeQuoted("'", { multiline: false });
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      if (cpp && s.peek() === '"' && /^(?:u8|u|U|L)?R$/.test(word)) return consumeCppRawString(s, word.length);
      if (s.peek() === '"' && /^(?:u8|u|U|L)$/.test(word)) {
        s.consumeQuoted('"', { multiline: false, prefixLength: word.length });
        return true;
      }
      if (cpp && /^\d/.test(word) && s.peek() === "'" && /[0-9a-fA-F]/.test(s.peek(1) ?? '')) {
        s.noteCode('number', word);
        return true;
      }
      return false;
    },
  };
}

function consumeCSharpRawString(s, prefixLength) {
  const start = s.i - prefixLength;
  let quotes = 0;
  while (s.src[s.i + quotes] === '"') quotes++;
  const terminator = '"'.repeat(quotes);
  const end = s.src.indexOf(terminator, s.i + quotes);
  if (end === -1) throw new UnreliableParse('unterminated raw string literal', start);
  s.i = end + quotes;
  while (s.src[s.i] === '"') s.i++;
  s.recordString(start, s.i, { raw: true });
}

export function csharpProfile() {
  const interpolation = { open: '{', close: '}', openBracket: '{', escapedBy: '{{' };
  return {
    step(s) {
      if (slashSlashAndBlock(s)) return true;
      if (s.startsWith('"""')) {
        consumeCSharpRawString(s, 0);
        return true;
      }
      const prefix = /^(\$+@?|@\$*)"/.exec(s.src.slice(s.i, s.i + 8));
      if (prefix) {
        const marker = prefix[1];
        s.i += marker.length;
        if (s.startsWith('"""')) {
          consumeCSharpRawString(s, marker.length);
          return true;
        }
        const verbatim = marker.includes('@');
        const interpolated = marker.includes('$');
        s.consumeQuoted('"', {
          escape: verbatim ? null : '\\',
          doubled: verbatim,
          multiline: verbatim,
          interpolation: interpolated ? interpolation : null,
          prefixLength: marker.length,
        });
        return true;
      }
      const ch = s.peek();
      if (ch === '"') {
        s.consumeQuoted('"', { multiline: false });
        return true;
      }
      if (ch === "'") {
        s.consumeQuoted("'", { multiline: false });
        return true;
      }
      return false;
    },
  };
}

export function javaProfile({ kotlin = false } = {}) {
  const templates = kotlin ? { open: '${', close: '}', openBracket: '{' } : null;
  return {
    step(s) {
      if (kotlin && s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (slashSlashAndBlock(s, { nestedBlocks: kotlin })) return true;
      if (s.startsWith('"""')) {
        s.consumeQuoted('"""', { escape: kotlin ? null : '\\', interpolation: templates });
        return true;
      }
      const ch = s.peek();
      if (ch === '"') {
        s.consumeQuoted('"', { multiline: false, interpolation: templates });
        return true;
      }
      if (ch === "'") {
        s.consumeQuoted("'", { multiline: false });
        return true;
      }
      return false;
    },
  };
}

function consumeSwiftExtendedString(s) {
  let hashes = 0;
  while (s.src[s.i + hashes] === '#') hashes++;
  const afterHashes = s.i + hashes;
  if (s.src[afterHashes] === '/') {
    const terminator = `/${'#'.repeat(hashes)}`;
    const end = s.src.indexOf(terminator, afterHashes + 1);
    if (end === -1) throw new UnreliableParse('unterminated extended regex literal', s.i);
    const start = s.i;
    s.i = end + terminator.length;
    s.recordString(start, s.i, { regex: true });
    return true;
  }
  if (s.src[afterHashes] !== '"') return false;
  const start = s.i;
  const multiline = s.src.startsWith('"""', afterHashes);
  const terminator = `${multiline ? '"""' : '"'}${'#'.repeat(hashes)}`;
  const end = s.src.indexOf(terminator, afterHashes + (multiline ? 3 : 1));
  if (end === -1) throw new UnreliableParse('unterminated extended string', start);
  s.i = end + terminator.length;
  s.recordString(start, s.i, { raw: true });
  return true;
}

export function swiftProfile() {
  const interpolation = { open: '\\(', close: ')', openBracket: '(' };
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (slashSlashAndBlock(s, { nestedBlocks: true })) return true;
      if (s.peek() === '#' && consumeSwiftExtendedString(s)) return true;
      if (s.startsWith('"""')) {
        s.consumeQuoted('"""', { interpolation });
        return true;
      }
      if (s.peek() === '"') {
        s.consumeQuoted('"', { multiline: false, interpolation });
        return true;
      }
      return false;
    },
  };
}

export function dartProfile() {
  const interpolation = { open: '${', close: '}', openBracket: '{' };
  function consumeDartString(s, raw, prefixLength) {
    const quote = quoteAt(s, ["'''", '"""', "'", '"']);
    s.consumeQuoted(quote, {
      escape: raw ? null : '\\',
      multiline: quote.length === 3,
      interpolation: raw ? null : interpolation,
      prefixLength,
    });
  }
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (slashSlashAndBlock(s, { nestedBlocks: true })) return true;
      const ch = s.peek();
      if (ch === '"' || ch === "'") {
        consumeDartString(s, false, 0);
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      const next = s.peek();
      if (word === 'r' && (next === '"' || next === "'")) {
        consumeDartString(s, true, 1);
        return true;
      }
      return false;
    },
  };
}

function consumeHeredocBody(s, terminator, { allowIndentedTerminator }) {
  let lineStart = s.src.indexOf('\n', s.i);
  if (lineStart === -1) throw new UnreliableParse('heredoc without body', s.i);
  lineStart++;
  const bodyStart = lineStart;
  while (lineStart <= s.src.length) {
    let lineEnd = s.src.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = s.src.length;
    let line = s.src.slice(lineStart, lineEnd).replace(/\r$/, '');
    if (allowIndentedTerminator) line = line.trimStart();
    if (line === terminator) {
      return { bodyStart, bodyEnd: lineStart, resume: lineEnd };
    }
    if (lineEnd === s.src.length) break;
    lineStart = lineEnd + 1;
  }
  throw new UnreliableParse('unterminated heredoc', s.i);
}

function makeHeredocQueue() {
  const pending = [];
  return {
    add(terminator, options) {
      pending.push({ terminator, options });
    },
    flushAtNewline(s) {
      if (pending.length === 0 || s.peek() !== '\n') return false;
      const queued = pending.splice(0);
      for (const { terminator, options } of queued) {
        const { bodyStart, resume } = consumeHeredocBody(s, terminator, options);
        s.recordString(bodyStart, resume, { heredoc: true });
        s.i = resume;
      }
      return true;
    },
    reset() {
      pending.length = 0;
    },
  };
}

const SHELL_WORD_BREAK = new Set([' ', '\t', '\n', '\r', ';', '|', '&', '(', ')', '<', '>']);

export function shellProfile() {
  const heredocs = makeHeredocQueue();
  const commandSubstitution = { open: '$(', close: ')', openBracket: '(' };
  return {
    step(s) {
      if (heredocs.flushAtNewline(s)) return true;
      const ch = s.peek();
      if (ch === '#') {
        const previous = s.i === 0 ? '\n' : s.src[s.i - 1];
        if (SHELL_WORD_BREAK.has(previous)) {
          s.consumeLineComment(1, s.i === 0 && s.startsWith('#!') ? 'shebang' : 'line');
          return true;
        }
        s.i++;
        return true;
      }
      if (ch === '\\') {
        s.i += 2;
        return true;
      }
      if (ch === "'") {
        s.consumeQuoted("'", { escape: null });
        return true;
      }
      if (ch === '"') {
        s.consumeQuoted('"', { interpolation: commandSubstitution });
        return true;
      }
      if (ch === '`') {
        s.consumeQuoted('`');
        return true;
      }
      if (s.startsWith("$'")) {
        s.i++;
        s.consumeQuoted("'", { prefixLength: 1 });
        return true;
      }
      if (s.startsWith('${')) {
        s.i += 2;
        s.scanUntilClose('}', '{');
        return true;
      }
      if (s.startsWith('<<') && !s.startsWith('<<<')) {
        const heredoc = /^<<(-?)\s*(['"]?)([A-Za-z_][\w.-]*)\2/.exec(s.src.slice(s.i, s.i + 80));
        if (heredoc) {
          heredocs.add(heredoc[3], { allowIndentedTerminator: heredoc[1] === '-' });
          s.i += heredoc[0].length;
          return true;
        }
      }
      return false;
    },
  };
}

const RUBY_EXPRESSION_KEYWORDS = new Set(['if', 'elsif', 'unless', 'while', 'until', 'when', 'and', 'or', 'not', 'return', 'puts', 'print', 'in', 'then', 'do']);

const RUBY_PERCENT_PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' };

function consumeRubyPercentLiteral(s) {
  const match = /^%([qQwWiIrsx]?)([^\w\s])/.exec(s.src.slice(s.i, s.i + 3));
  if (!match) return false;
  const start = s.i;
  const open = match[2];
  const close = RUBY_PERCENT_PAIRS[open] ?? open;
  let depth = 1;
  let j = s.i + match[0].length;
  while (j < s.src.length) {
    const ch = s.src[j];
    if (ch === '\\') {
      j += 2;
      continue;
    }
    if (ch === close && open !== close) {
      depth--;
      if (depth === 0) break;
    } else if (ch === open && open !== close) depth++;
    else if (ch === close) break;
    j++;
  }
  if (j >= s.src.length) throw new UnreliableParse('unterminated percent literal', start);
  s.i = j + 1;
  s.recordString(start, s.i, { percent: true });
  return true;
}

export function rubyProfile() {
  const heredocs = makeHeredocQueue();
  const interpolation = { open: '#{', close: '}', openBracket: '{' };
  return {
    step(s) {
      if (heredocs.flushAtNewline(s)) return true;
      if (s.isLineStart() && s.startsWith('=begin') && s.isLineStart()) {
        const end = /\n=end[^\n]*/.exec(s.src.slice(s.i));
        if (!end) throw new UnreliableParse('unterminated =begin block', s.i);
        const start = s.i;
        s.i += end.index + end[0].length;
        s.recordComment(start, s.i, 'block', { markerLength: 6, closeLength: 4, embeddedDocument: true });
        return true;
      }
      if (s.isLineStart() && s.startsWith('__END__') && /^__END__\r?(\n|$)/.test(s.src.slice(s.i, s.i + 9))) {
        s.i = s.src.length;
        return true;
      }
      const ch = s.peek();
      if (ch === '#') {
        s.consumeLineComment(1, s.i === 0 && s.startsWith('#!') ? 'shebang' : 'line');
        return true;
      }
      if (ch === '$' && /[^\w\s{]/.test(s.peek(1) ?? '')) {
        s.i += 2;
        s.noteCode('word', '$');
        return true;
      }
      if (ch === '?' && /["'#]/.test(s.peek(1) ?? '') && expressionCanStartHere(s, RUBY_EXPRESSION_KEYWORDS)) {
        s.i += 2;
        s.noteCode('string');
        return true;
      }
      if (ch === '"' || ch === '`') {
        s.consumeQuoted(ch, { interpolation });
        return true;
      }
      if (ch === "'") {
        s.consumeQuoted("'");
        return true;
      }
      if (ch === '%' && expressionCanStartHere(s, RUBY_EXPRESSION_KEYWORDS) && consumeRubyPercentLiteral(s)) return true;
      if (ch === '/' && expressionCanStartHere(s, RUBY_EXPRESSION_KEYWORDS)) {
        consumeRegexLiteral(s);
        return true;
      }
      if (s.startsWith('<<')) {
        const heredoc = /^<<([~-]?)(['"`]?)([A-Za-z_]\w*)\2/.exec(s.src.slice(s.i, s.i + 80));
        const squiggly = heredoc && (heredoc[1] !== '' || heredoc[2] !== '' || /^[A-Z_]/.test(heredoc[3]));
        if (heredoc && squiggly && s.lastToken !== 'close' && s.lastToken !== 'number') {
          heredocs.add(heredoc[3], { allowIndentedTerminator: heredoc[1] !== '' });
          s.i += heredoc[0].length;
          s.noteCode('string');
          return true;
        }
      }
      return false;
    },
  };
}

function consumePhpHeredoc(s) {
  const match = /^<<<[ \t]*(['"]?)([A-Za-z_]\w*)\1\r?\n/.exec(s.src.slice(s.i, s.i + 80));
  if (!match) return false;
  const start = s.i;
  const identifier = match[2];
  const closing = new RegExp(`\\n[ \\t]*${identifier}\\b`);
  const rest = s.src.slice(s.i + match[0].length - 1);
  const end = closing.exec(rest);
  if (!end) throw new UnreliableParse('unterminated heredoc', start);
  s.i = s.i + match[0].length - 1 + end.index + end[0].length;
  s.recordString(start, s.i, { heredoc: true });
  return true;
}

export function phpProfile() {
  let inPhp = false;
  return {
    step(s) {
      if (!inPhp) {
        const open = s.src.indexOf('<?', s.i);
        if (open === -1) {
          s.i = s.src.length;
          return true;
        }
        s.i = open + (s.src.startsWith('<?php', open) ? 5 : s.src.startsWith('<?=', open) ? 3 : 2);
        inPhp = true;
        s.noteCode(null);
        s.lastToken = null;
        return true;
      }
      if (s.startsWith('?>')) {
        s.i += 2;
        inPhp = false;
        return true;
      }
      if (s.startsWith('//')) {
        s.consumeLineComment(2, 'line', { stopAt: '?>' });
        return true;
      }
      if (s.peek() === '#' && s.peek(1) !== '[') {
        s.consumeLineComment(1, 'line', { stopAt: '?>' });
        return true;
      }
      if (s.startsWith('/*')) {
        s.consumeBlockComment('/*', '*/');
        return true;
      }
      if (s.startsWith('<<<') && consumePhpHeredoc(s)) return true;
      const ch = s.peek();
      if (ch === "'" || ch === '"' || ch === '`') {
        s.consumeQuoted(ch);
        return true;
      }
      return false;
    },
  };
}

function consumeLuaLongBracket(s, offset) {
  const match = /^\[(=*)\[/.exec(s.src.slice(s.i + offset, s.i + offset + 20));
  if (!match) return null;
  const terminator = `]${match[1]}]`;
  const end = s.src.indexOf(terminator, s.i + offset + match[0].length);
  if (end === -1) throw new UnreliableParse('unterminated long bracket', s.i);
  return end + terminator.length;
}

export function luaProfile() {
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      if (s.startsWith('--')) {
        const longEnd = consumeLuaLongBracket(s, 2);
        if (longEnd !== null) {
          const start = s.i;
          s.i = longEnd;
          s.recordComment(start, longEnd, 'block', { markerLength: 4, closeLength: 2 });
          return true;
        }
        s.consumeLineComment(2);
        return true;
      }
      const ch = s.peek();
      if (ch === '[') {
        const longEnd = consumeLuaLongBracket(s, 0);
        if (longEnd !== null) {
          const start = s.i;
          s.i = longEnd;
          s.recordString(start, longEnd, { raw: true });
          return true;
        }
        return false;
      }
      if (ch === '"' || ch === "'") {
        s.consumeQuoted(ch, { multiline: false });
        return true;
      }
      return false;
    },
  };
}

const ELIXIR_SIGIL_PAIRS = { '(': ')', '[': ']', '{': '}', '<': '>' };

export function elixirProfile() {
  const interpolation = { open: '#{', close: '}', openBracket: '{' };
  return {
    step(s) {
      if (s.i === 0 && s.startsWith('#!')) {
        s.consumeLineComment(2, 'shebang');
        return true;
      }
      const ch = s.peek();
      if (ch === '#') {
        s.consumeLineComment(1);
        return true;
      }
      if (ch === '?' && s.peek(1) !== undefined && !isWhitespace(s.peek(1))) {
        s.i += s.peek(1) === '\\' ? 3 : 2;
        s.noteCode('string');
        return true;
      }
      if (ch === '~' && /[A-Za-z]/.test(s.peek(1) ?? '')) {
        const start = s.i;
        let j = s.i + 1;
        while (/[A-Za-z]/.test(s.src[j] ?? '')) j++;
        const delimiter = s.src[j];
        const raw = /[A-Z]/.test(s.src[s.i + 1]);
        s.i = j;
        if (s.startsWith('"""') || s.startsWith("'''")) {
          s.consumeQuoted(s.src.slice(j, j + 3), { escape: raw ? null : '\\', prefixLength: j - start });
        } else if (delimiter !== undefined) {
          const close = ELIXIR_SIGIL_PAIRS[delimiter] ?? delimiter;
          const end = s.src.indexOf(close, j + 1);
          if (end === -1) throw new UnreliableParse('unterminated sigil', start);
          s.i = end + 1;
          s.recordString(start, s.i, { sigil: true });
        }
        while (/[A-Za-z]/.test(s.peek() ?? '')) s.i++;
        return true;
      }
      if (s.startsWith('"""') || s.startsWith("'''")) {
        s.consumeQuoted(s.src.slice(s.i, s.i + 3), { interpolation });
        return true;
      }
      if (ch === '"' || ch === "'") {
        s.consumeQuoted(ch, { interpolation });
        return true;
      }
      return false;
    },
  };
}

export function rProfile() {
  return {
    step(s) {
      const ch = s.peek();
      if (ch === '#') {
        s.consumeLineComment(1, s.i === 0 && s.startsWith('#!') ? 'shebang' : 'line');
        return true;
      }
      if (ch === '"' || ch === "'") {
        s.consumeQuoted(ch);
        return true;
      }
      if (ch === '`') {
        s.consumeQuoted('`', { escape: null });
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      if ((word === 'r' || word === 'R') && (s.peek() === '"' || s.peek() === "'")) {
        const match = /^(["'])(-*)([([{])/.exec(s.src.slice(s.i, s.i + 40));
        if (!match) return false;
        const closer = { '(': ')', '[': ']', '{': '}' }[match[3]];
        const terminator = `${closer}${match[2]}${match[1]}`;
        const end = s.src.indexOf(terminator, s.i + match[0].length);
        if (end === -1) throw new UnreliableParse('unterminated raw string', s.i);
        const start = s.i - 1;
        s.i = end + terminator.length;
        s.recordString(start, s.i, { raw: true });
        return true;
      }
      return false;
    },
  };
}

export function sqlProfile() {
  return {
    step(s) {
      if (s.startsWith('--')) {
        s.consumeLineComment(2);
        return true;
      }
      if (s.startsWith('/*')) {
        s.consumeBlockComment('/*', '*/', { nests: 'reject' });
        return true;
      }
      const ch = s.peek();
      if (ch === "'") {
        s.consumeQuoted("'", { escape: null, doubled: true });
        return true;
      }
      if (ch === '"' || ch === '`') {
        s.consumeQuoted(ch, { escape: null, doubled: true });
        return true;
      }
      if (ch === '$') {
        const tag = /^\$([A-Za-z_]\w*)?\$/.exec(s.src.slice(s.i, s.i + 64));
        if (tag && !isIdentifierChar(s.src[s.i - 1])) {
          const end = s.src.indexOf(tag[0], s.i + tag[0].length);
          if (end === -1) throw new UnreliableParse('unterminated dollar-quoted string', s.i);
          const start = s.i;
          s.i = end + tag[0].length;
          s.recordString(start, s.i, { dollarQuoted: true });
          return true;
        }
      }
      return false;
    },
    afterWord(s, word) {
      if ((word === 'E' || word === 'e') && s.peek() === "'") {
        s.consumeQuoted("'", { doubled: true, prefixLength: 1 });
        return true;
      }
      return false;
    },
  };
}

export function cssProfile({ lineComments = false } = {}) {
  return {
    step(s) {
      if (s.startsWith('/*')) {
        s.consumeBlockComment('/*', '*/');
        return true;
      }
      if (lineComments && s.startsWith('//')) {
        s.consumeLineComment(2);
        return true;
      }
      const ch = s.peek();
      if (ch === '"' || ch === "'") {
        s.consumeQuoted(ch, { multiline: false });
        return true;
      }
      return false;
    },
    afterWord(s, word) {
      if (word.toLowerCase() === 'url' && s.peek() === '(') {
        const rest = s.src.slice(s.i + 1).trimStart();
        if (rest.startsWith('"') || rest.startsWith("'")) return false;
        const close = s.src.indexOf(')', s.i);
        if (close === -1) throw new UnreliableParse('unterminated url()', s.i);
        const start = s.i;
        s.i = close + 1;
        s.recordString(start, s.i, { url: true });
        return true;
      }
      return false;
    },
  };
}

function hashCommentIfStandalone(s, previousAllowsComment) {
  if (s.peek() !== '#') return false;
  const previous = s.i === 0 ? '\n' : s.src[s.i - 1];
  if (!previousAllowsComment(previous)) return false;
  s.consumeLineComment(1);
  return true;
}

function yamlBlockScalarIndicator(s) {
  const match = /^[|>][1-9+-]{0,2}[ \t]*(#[^\n]*)?\r?\n/.exec(s.src.slice(s.i, s.i + 200));
  if (!match) return null;
  const previous = s.src[s.i - 1];
  if (previous !== ' ' && previous !== '\t' && previous !== ':' && previous !== '-') return null;
  return match;
}

function lineIndentAt(src, offset) {
  const lineStart = src.lastIndexOf('\n', offset - 1) + 1;
  let indent = 0;
  while (src[lineStart + indent] === ' ') indent++;
  return indent;
}

function skipYamlBlockScalar(s, indicator) {
  const parentIndent = lineIndentAt(s.src, s.i);
  const commentOffset = indicator[1] ? s.i + indicator[0].indexOf('#') : -1;
  if (commentOffset !== -1) {
    s.i = commentOffset;
    s.consumeLineComment(1);
  }
  let lineStart = s.src.indexOf('\n', s.i) + 1;
  const bodyStart = lineStart;
  while (lineStart > 0 && lineStart < s.src.length) {
    let lineEnd = s.src.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = s.src.length;
    const line = s.src.slice(lineStart, lineEnd).replace(/\r$/, '');
    const indent = line.length - line.trimStart().length;
    if (line.trim() !== '' && indent <= parentIndent) break;
    lineStart = lineEnd + 1;
  }
  const end = Math.min(lineStart, s.src.length);
  if (end > bodyStart) s.recordString(bodyStart, end, { blockScalar: true });
  s.i = end;
}

export function yamlProfile() {
  const startsScalar = (previous) => previous === undefined || /[\s:[{,\-?]/.test(previous);
  return {
    step(s) {
      if (hashCommentIfStandalone(s, (previous) => previous === ' ' || previous === '\t' || previous === '\n')) return true;
      const ch = s.peek();
      if ((ch === '|' || ch === '>') && yamlBlockScalarIndicator(s)) {
        skipYamlBlockScalar(s, yamlBlockScalarIndicator(s));
        return true;
      }
      if ((ch === '"' || ch === "'") && startsScalar(s.src[s.i - 1])) {
        if (ch === '"') s.consumeQuoted('"');
        else s.consumeQuoted("'", { escape: null, doubled: true });
        return true;
      }
      if (isIdentifierChar(ch)) {
        while (s.i < s.src.length && !/[\s#:,[\]{}]/.test(s.src[s.i])) s.i++;
        s.noteCode('word');
        return true;
      }
      return false;
    },
  };
}

export function tomlProfile() {
  return {
    step(s) {
      if (s.peek() === '#') {
        s.consumeLineComment(1);
        return true;
      }
      const quote = quoteAt(s, ['"""', "'''", '"', "'"]);
      if (quote) {
        s.consumeQuoted(quote, { escape: quote.startsWith('"') ? '\\' : null, multiline: quote.length === 3 });
        return true;
      }
      return false;
    },
  };
}

export function hclProfile() {
  const heredocs = makeHeredocQueue();
  const interpolation = { open: '${', close: '}', openBracket: '{' };
  return {
    step(s) {
      if (heredocs.flushAtNewline(s)) return true;
      if (s.peek() === '#') {
        s.consumeLineComment(1);
        return true;
      }
      if (slashSlashAndBlock(s)) return true;
      if (s.peek() === '"') {
        s.consumeQuoted('"', { multiline: false, interpolation });
        return true;
      }
      const heredoc = s.startsWith('<<') ? /^<<(-?)([A-Za-z_]\w*)/.exec(s.src.slice(s.i, s.i + 80)) : null;
      if (heredoc) {
        heredocs.add(heredoc[2], { allowIndentedTerminator: true });
        s.i += heredoc[0].length;
        return true;
      }
      return false;
    },
  };
}

export function dockerfileProfile() {
  const heredocs = makeHeredocQueue();
  return {
    step(s) {
      if (heredocs.flushAtNewline(s)) return true;
      if (s.peek() === '#' && s.isLineStart()) {
        s.consumeLineComment(1);
        return true;
      }
      const heredoc = s.startsWith('<<') ? /^<<(-?)(['"]?)([A-Za-z_]\w*)\2/.exec(s.src.slice(s.i, s.i + 80)) : null;
      if (heredoc) {
        heredocs.add(heredoc[3], { allowIndentedTerminator: heredoc[1] === '-' });
        s.i += heredoc[0].length;
        return true;
      }
      return false;
    },
  };
}
