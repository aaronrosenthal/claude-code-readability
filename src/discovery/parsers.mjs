import { lexSource } from '../lexer/lex.mjs';

function stripWithLexer(text, languageId) {
  const lexed = lexSource(text, languageId);
  if (!lexed.ok) return null;
  let output = '';
  let cursor = 0;
  for (const comment of lexed.comments) {
    output += text.slice(cursor, comment.start);
    cursor = comment.end;
  }
  return output + text.slice(cursor);
}

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) return trimmed.slice(1, -1);
  return trimmed;
}

function splitTopLevel(text, separator = ',') {
  const parts = [];
  let depth = 0;
  let quote = null;
  let current = '';
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim()).filter(Boolean);
}

function yamlScalar(raw) {
  const value = raw.trim();
  if (value === '') return null;
  if (value.startsWith('[') && value.endsWith(']')) return splitTopLevel(value.slice(1, -1)).map(yamlScalar);
  if (value.startsWith('{') && value.endsWith('}')) {
    const object = {};
    for (const pair of splitTopLevel(value.slice(1, -1))) {
      const index = pair.indexOf(':');
      if (index !== -1) object[unquote(pair.slice(0, index))] = yamlScalar(pair.slice(index + 1));
    }
    return object;
  }
  if (/^(?:true|yes|on)$/i.test(value)) return true;
  if (/^(?:false|no|off)$/i.test(value)) return false;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return unquote(value);
}

export function parseYamlLite(text) {
  const stripped = stripWithLexer(text, 'yaml');
  if (stripped === null) return null;
  const lines = stripped.split(/\r?\n/).filter((line) => line.trim() !== '' && line.trim() !== '---');
  const root = {};
  const stack = [{ indent: -1, container: root, key: null }];
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const indent = line.length - line.trimStart().length;
    const content = line.trim();
    while (stack.length > 1 && indent <= stack.at(-1).indent) stack.pop();
    const parent = stack.at(-1);
    if (content.startsWith('- ') || content === '-') {
      if (!Array.isArray(parent.container)) {
        const holder = stack.at(-1);
        if (holder.owner && holder.key !== null && !Array.isArray(holder.owner[holder.key])) {
          holder.owner[holder.key] = [];
          holder.container = holder.owner[holder.key];
        } else continue;
      }
      const item = content.slice(1).trim();
      const pair = /^([\w./@-]+|"[^"]*"|'[^']*')\s*:(?:\s+(.*))?$/.exec(item);
      if (pair) {
        const object = { [unquote(pair[1])]: yamlScalar(pair[2] ?? '') };
        stack.at(-1).container.push(object);
        stack.push({ indent, container: object, key: null });
      } else {
        stack.at(-1).container.push(yamlScalar(item));
      }
      continue;
    }
    const pair = /^([^:]+?|"[^"]*"|'[^']*')\s*:(?:\s+(.*))?$/.exec(content);
    if (!pair || Array.isArray(parent.container)) continue;
    const key = unquote(pair[1]);
    if (pair[2] !== undefined && pair[2].trim() !== '' && !/^[|>]/.test(pair[2].trim())) {
      parent.container[key] = yamlScalar(pair[2]);
      continue;
    }
    const child = {};
    parent.container[key] = child;
    stack.push({ indent, container: child, owner: parent.container, key });
  }
  return root;
}

function tomlValue(raw) {
  const value = raw.trim();
  if (value.startsWith('"""') || value.startsWith("'''")) return value.slice(3, -3);
  if (value.startsWith('"') || value.startsWith("'")) return unquote(value);
  if (value.startsWith('[')) return splitTopLevel(value.slice(1, value.lastIndexOf(']'))).map(tomlValue);
  if (value.startsWith('{')) {
    const object = {};
    for (const pair of splitTopLevel(value.slice(1, value.lastIndexOf('}')))) {
      const index = pair.indexOf('=');
      if (index !== -1) assignDotted(object, pair.slice(0, index), tomlValue(pair.slice(index + 1)));
    }
    return object;
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (/^[+-]?\d[\d_]*(?:\.\d+)?$/.test(value)) return Number(value.replace(/_/g, ''));
  return value;
}

function dottedParts(key) {
  return splitTopLevel(key, '.').map(unquote);
}

function assignDotted(target, key, value) {
  const parts = dottedParts(key);
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ??= {};
    cursor = cursor[part];
  }
  cursor[parts.at(-1)] = value;
}

function bracketBalance(text) {
  let balance = 0;
  let quote = null;
  for (const ch of text) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '[' || ch === '{') balance++;
    else if (ch === ']' || ch === '}') balance--;
  }
  return balance;
}

export function parseTomlLite(text) {
  const stripped = stripWithLexer(text, 'toml');
  if (stripped === null) return null;
  const root = {};
  let table = root;
  const lines = stripped.split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].trim();
    if (!line) continue;
    const header = /^\[\[?([^\]]+)\]\]?$/.exec(line);
    if (header) {
      if (line.startsWith('[[')) {
        table = {};
        continue;
      }
      table = root;
      for (const part of dottedParts(header[1])) {
        table[part] ??= {};
        table = table[part];
      }
      continue;
    }
    const equals = line.indexOf('=');
    if (equals === -1) continue;
    let value = line.slice(equals + 1);
    while (bracketBalance(value) > 0 && index + 1 < lines.length) value += ` ${lines[++index].trim()}`;
    const tripleQuote = value.trim().slice(0, 3);
    if ((tripleQuote === '"""' || tripleQuote === "'''") && !value.trim().slice(3).includes(tripleQuote)) {
      while (index + 1 < lines.length) {
        value += `\n${lines[++index]}`;
        if (lines[index].includes(tripleQuote)) break;
      }
    }
    assignDotted(table, line.slice(0, equals), tomlValue(value));
  }
  return root;
}

export function parseIni(text) {
  const sections = {};
  let current = null;
  let lastKey = null;
  for (const rawLine of text.split(/\r?\n/)) {
    if (/^\s*[#;]/.test(rawLine) || rawLine.trim() === '') continue;
    const section = /^\s*\[([^\]]+)\]\s*$/.exec(rawLine);
    if (section) {
      current = sections[section[1].trim()] ??= {};
      lastKey = null;
      continue;
    }
    if (current && lastKey && /^\s+\S/.test(rawLine)) {
      current[lastKey] += `\n${rawLine.trim()}`;
      continue;
    }
    const pair = /^\s*([^=:]+?)\s*[=:]\s*(.*)$/.exec(rawLine);
    if (pair && current) {
      lastKey = pair[1].trim().toLowerCase();
      current[lastKey] = pair[2].trim();
    }
  }
  return sections;
}

export function stripXmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, '');
}

export function stripJsComments(text, languageId = 'javascript') {
  return stripWithLexer(text, languageId);
}

export function parseJsonc(text) {
  const stripped = stripWithLexer(text, 'javascript');
  if (stripped === null) return null;
  try {
    return JSON.parse(stripped.replace(/,(\s*[}\]])/g, '$1'));
  } catch {
    return null;
  }
}
