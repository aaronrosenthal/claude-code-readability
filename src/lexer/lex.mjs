import { familyOf, languageById } from './languages.mjs';
import { cssProfile, javascriptProfile } from './profiles.mjs';
import { Scanner, UnreliableParse } from './scanner.mjs';

const BLOCK_MARKERS = [
  ['<!--', '-->'],
  ['--[', null],
  ['=begin', '=end'],
  ['/*', '*/'],
];
const LINE_MARKERS = ['//', '#', '--'];

export class LineIndex {
  constructor(source) {
    this.starts = [0];
    for (let i = 0; i < source.length; i++) if (source[i] === '\n') this.starts.push(i + 1);
  }

  lineOf(offset) {
    let low = 0;
    let high = this.starts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (this.starts[mid] <= offset) low = mid;
      else high = mid - 1;
    }
    return low + 1;
  }

  lineStart(line) {
    return this.starts[line - 1] ?? 0;
  }

  get lineCount() {
    return this.starts.length;
  }
}

function scanWith(profile, source) {
  return new Scanner(source, profile).run();
}

function attributeValue(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag);
  return match ? (match[1] ?? match[2] ?? match[3]) : null;
}

function embeddedScriptLanguage(openTag) {
  const lang = attributeValue(openTag, 'lang')?.toLowerCase();
  const type = attributeValue(openTag, 'type')?.toLowerCase();
  if (type && !/(?:java|ecma)script|module|babel|jsx|typescript/.test(type)) return null;
  if (lang === 'ts' || lang === 'typescript') return 'typescript';
  if (lang === 'tsx') return 'tsx';
  if (lang && lang !== 'js' && lang !== 'javascript' && lang !== 'jsx') throw new UnreliableParse(`unsupported script lang "${lang}"`, 0);
  return 'javascript';
}

function embeddedStyleLanguage(openTag) {
  const lang = attributeValue(openTag, 'lang')?.toLowerCase();
  if (!lang || lang === 'css' || lang === 'postcss') return 'css';
  if (lang === 'scss' || lang === 'less') return 'scss';
  throw new UnreliableParse(`unsupported style lang "${lang}"`, 0);
}

function lexEmbedded(source, start, end, languageId, output) {
  const profile = languageId === 'css' || languageId === 'scss' ? cssProfile({ lineComments: languageId === 'scss' }) : javascriptProfile({ jsx: languageId !== 'typescript' });
  const inner = scanWith(profile, source.slice(start, end));
  for (const comment of inner.comments) output.comments.push({ ...comment, start: comment.start + start, end: comment.end + start, language: languageId });
  for (const string of inner.strings) output.strings.push({ ...string, start: string.start + start, end: string.end + start });
}

function lexMarkup(source, { scripts }) {
  const output = { comments: [], strings: [] };
  const lower = source.toLowerCase();
  let i = 0;
  while (i < source.length) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end === -1) throw new UnreliableParse('unterminated HTML comment', i);
      output.comments.push({ start: i, end: end + 3, style: 'block', markerLength: 4, closeLength: 3 });
      i = end + 3;
      continue;
    }
    if (source.startsWith('<![CDATA[', i)) {
      const end = source.indexOf(']]>', i);
      if (end === -1) throw new UnreliableParse('unterminated CDATA section', i);
      i = end + 3;
      continue;
    }
    if (source[i] !== '<' || !/[A-Za-z/!?]/.test(source[i + 1] ?? '')) {
      i++;
      continue;
    }
    const tagEnd = findTagEnd(source, i);
    const openTag = source.slice(i, tagEnd);
    const name = /^<\/?\s*([\w:-]+)/.exec(openTag)?.[1]?.toLowerCase();
    i = tagEnd;
    if (!scripts || openTag.startsWith('</') || openTag.endsWith('/>')) continue;
    if (name === 'script' || name === 'style' || name === 'template') {
      const close = lower.indexOf(`</${name}`, i);
      if (close === -1) throw new UnreliableParse(`unterminated <${name}>`, i);
      if (name === 'template') {
        const lang = attributeValue(openTag, 'lang');
        if (lang && lang.toLowerCase() !== 'html') throw new UnreliableParse(`unsupported template lang "${lang}"`, i);
        continue;
      }
      const languageId = name === 'script' ? embeddedScriptLanguage(openTag) : embeddedStyleLanguage(openTag);
      if (languageId) lexEmbedded(source, i, close, languageId, output);
      i = close;
    }
  }
  return output;
}

function findTagEnd(source, start) {
  let i = start + 1;
  while (i < source.length) {
    const ch = source[i];
    if (ch === '"' || ch === "'") {
      const close = source.indexOf(ch, i + 1);
      if (close === -1) throw new UnreliableParse('unterminated attribute value', i);
      i = close + 1;
      continue;
    }
    if (ch === '>') return i + 1;
    i++;
  }
  throw new UnreliableParse('unterminated tag', start);
}

function baseMarker(text, style) {
  if (style === 'shebang') return '#!';
  if (style === 'block') {
    for (const [open] of BLOCK_MARKERS) if (text.startsWith(open)) return open;
  }
  for (const marker of LINE_MARKERS) if (text.startsWith(marker)) return marker;
  return text.slice(0, 1);
}

function stripBlockDecoration(inner) {
  const lines = inner.split('\n').map((line) => line.replace(/\r$/, ''));
  return lines
    .map((line) => line.replace(/^\s*\*+(?!\/)\s?/, '').trimEnd())
    .join('\n')
    .trim();
}

function cleanBody(afterMarker, style, marker) {
  if (style === 'shebang') return afterMarker.trim();
  if (style === 'block') {
    const withoutDocMarker = marker === '/*' ? afterMarker.replace(/^[*!]+/, '') : afterMarker;
    return stripBlockDecoration(withoutDocMarker);
  }
  const lastMarkerChar = marker[marker.length - 1];
  let index = 0;
  while (afterMarker[index] === lastMarkerChar || (index === 0 && (afterMarker[0] === '!' || afterMarker[0] === "'"))) index++;
  return afterMarker.slice(index).trim();
}

function maskSource(source, comments, strings) {
  const chars = source.split('');
  for (const comment of comments) for (let i = comment.start; i < comment.end; i++) if (chars[i] !== '\n') chars[i] = ' ';
  for (const string of strings) for (let i = string.start; i < string.end; i++) if (chars[i] !== '\n' && chars[i] !== ' ') chars[i] = '_';
  return chars.join('');
}

function enrichComments(source, rawComments, defaultLanguage, masked, lines) {
  return rawComments
    .sort((a, b) => a.start - b.start)
    .map((raw) => {
      const text = source.slice(raw.start, raw.end);
      const marker = baseMarker(text, raw.style);
      const closeLength = raw.style === 'block' ? (raw.closeLength ?? 0) : 0;
      const afterMarker = text.slice(marker.length, text.length - closeLength);
      const line = lines.lineOf(raw.start);
      const endLine = lines.lineOf(Math.max(raw.start, raw.end - 1));
      const lineStart = lines.lineStart(line);
      let lineEnd = source.indexOf('\n', raw.end);
      if (lineEnd === -1) lineEnd = source.length;
      return {
        language: raw.language ?? defaultLanguage,
        start: raw.start,
        end: raw.end,
        text,
        style: raw.style,
        marker,
        afterMarker,
        body: cleanBody(afterMarker, raw.style, marker),
        line,
        endLine,
        column: raw.start - lineStart + 1,
        ownLine: masked.slice(lineStart, raw.start).trim() === '',
        codeAfter: masked.slice(raw.end, lineEnd).trim() !== '',
        embeddedDocument: raw.embeddedDocument ?? false,
      };
    });
}

export function lexSource(source, languageId) {
  const language = languageById(languageId);
  if (!language) return { ok: false, reason: `unsupported language ${languageId}` };
  try {
    const raw = language.markup ? lexMarkup(source, language.markup) : scanWith(language.profile(), source);
    const masked = maskSource(source, raw.comments, raw.strings);
    const lines = new LineIndex(source);
    const defaultLanguage = language.markup ? language.id : familyOf(language);
    return {
      ok: true,
      language: language.id,
      family: familyOf(language),
      comments: enrichComments(source, raw.comments, defaultLanguage, masked, lines),
      strings: raw.strings.sort((a, b) => a.start - b.start),
      masked,
      lines,
    };
  } catch (error) {
    if (error instanceof UnreliableParse) return { ok: false, reason: error.reason, offset: error.offset };
    throw error;
  }
}
