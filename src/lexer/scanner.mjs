export class UnreliableParse extends Error {
  constructor(reason, offset) {
    super(`${reason} at offset ${offset}`);
    this.reason = reason;
    this.offset = offset;
  }
}

const IDENTIFIER_CHAR = /[\p{L}\p{N}_$]/u;

export function isIdentifierChar(ch) {
  return ch !== undefined && IDENTIFIER_CHAR.test(ch);
}

export function isWhitespace(ch) {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v';
}

export class Scanner {
  constructor(source, profile) {
    this.src = source;
    this.profile = profile;
    this.i = 0;
    this.comments = [];
    this.strings = [];
    this.lastToken = null;
    this.lastWord = null;
  }

  peek(offset = 0) {
    return this.src[this.i + offset];
  }

  startsWith(text, at = this.i) {
    return this.src.startsWith(text, at);
  }

  atEnd() {
    return this.i >= this.src.length;
  }

  isLineStart(at = this.i) {
    let j = at - 1;
    while (j >= 0 && (this.src[j] === ' ' || this.src[j] === '\t')) j--;
    return j < 0 || this.src[j] === '\n';
  }

  recordComment(start, end, style, details = {}) {
    this.comments.push({ start, end, style, ...details });
  }

  recordString(start, end, details = {}) {
    this.strings.push({ start, end, ...details });
    this.lastToken = 'string';
    this.lastWord = null;
  }

  noteCode(token, word = null) {
    this.lastToken = token;
    this.lastWord = word;
  }

  consumeLineComment(markerLength, style = 'line', { stopAt } = {}) {
    const start = this.i;
    let end = this.src.indexOf('\n', this.i);
    if (end === -1) end = this.src.length;
    if (stopAt) {
      const stop = this.src.indexOf(stopAt, this.i + markerLength);
      if (stop !== -1 && stop < end) end = stop;
    }
    if (end > start && this.src[end - 1] === '\r') end--;
    this.recordComment(start, end, style, { markerLength });
    this.i = end;
  }

  consumeBlockComment(open, close, { nests = false, style = 'block' } = {}) {
    const start = this.i;
    let depth = 1;
    let j = start + open.length;
    while (j < this.src.length) {
      if (this.src.startsWith(close, j)) {
        depth--;
        j += close.length;
        if (depth === 0) {
          this.recordComment(start, j, style, { markerLength: open.length, closeLength: close.length });
          this.i = j;
          return;
        }
        continue;
      }
      if (this.src.startsWith(open, j)) {
        if (nests === 'reject') throw new UnreliableParse('ambiguous nested block comment', j);
        if (nests) {
          depth++;
          j += open.length;
          continue;
        }
      }
      j++;
    }
    throw new UnreliableParse('unterminated block comment', start);
  }

  consumeQuoted(quote, { escape: escapeChar = '\\', doubled = false, multiline = true, interpolation = null, prefixLength = 0 } = {}) {
    const start = this.i - prefixLength;
    let j = this.i + quote.length;
    while (j < this.src.length) {
      const ch = this.src[j];
      if (interpolation && this.src.startsWith(interpolation.open, j)) {
        if (interpolation.escapedBy && this.src.startsWith(interpolation.escapedBy, j)) {
          j += interpolation.escapedBy.length;
          continue;
        }
        this.i = j + interpolation.open.length;
        this.scanUntilClose(interpolation.close, interpolation.openBracket);
        j = this.i;
        continue;
      }
      if (escapeChar && ch === escapeChar) {
        j += 2;
        continue;
      }
      if (this.src.startsWith(quote, j)) {
        if (doubled && this.src.startsWith(quote, j + quote.length)) {
          j += quote.length * 2;
          continue;
        }
        j += quote.length;
        this.i = j;
        this.recordString(start, j, { quote });
        return;
      }
      if (!multiline && ch === '\n') {
        throw new UnreliableParse('unterminated string', start);
      }
      j++;
    }
    throw new UnreliableParse('unterminated string', start);
  }

  scanUntilClose(close, openBracket) {
    let depth = 0;
    while (!this.atEnd()) {
      if (openBracket && this.startsWith(openBracket)) {
        depth++;
        this.i += openBracket.length;
        this.noteCode('punct');
        continue;
      }
      if (this.startsWith(close)) {
        if (depth === 0) {
          this.i += close.length;
          this.noteCode('punct');
          return;
        }
        depth--;
        this.i += close.length;
        this.noteCode('punct');
        continue;
      }
      this.step();
    }
    throw new UnreliableParse('unterminated interpolation', this.i);
  }

  step() {
    if (this.profile.step(this)) return;
    const ch = this.src[this.i];
    if (isIdentifierChar(ch)) {
      const start = this.i;
      while (isIdentifierChar(this.src[this.i])) this.i++;
      const word = this.src.slice(start, this.i);
      if (this.profile.afterWord?.(this, word, start)) return;
      this.noteCode(/^\p{N}/u.test(word) ? 'number' : 'word', word);
      return;
    }
    if (!isWhitespace(ch)) this.noteCode(ch === ')' || ch === ']' || ch === '}' ? 'close' : 'punct', ch);
    this.i++;
  }

  run() {
    while (!this.atEnd()) this.step();
    return { comments: this.comments, strings: this.strings };
  }
}
