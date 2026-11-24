const cache = new Map();

function escapeRegExp(text) {
  return text.replace(/[.+^${}()|[\]\\]/g, '\\$&');
}

function expandBraces(pattern) {
  const match = /\{([^{}]*)\}/.exec(pattern);
  if (!match) return [pattern];
  const before = pattern.slice(0, match.index);
  const after = pattern.slice(match.index + match[0].length);
  return match[1].split(',').flatMap((option) => expandBraces(`${before}${option}${after}`));
}

function compileSingle(pattern) {
  let source = '';
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        const slashAfter = pattern[i + 2] === '/';
        source += slashAfter ? '(?:.*/)?' : '.*';
        i += slashAfter ? 2 : 1;
      } else {
        source += '[^/]*';
      }
    } else if (ch === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(ch);
    }
  }
  return source;
}

export function globToRegExp(pattern) {
  if (cache.has(pattern)) return cache.get(pattern);
  const anchored = pattern.includes('/') ? pattern.replace(/^\.?\//, '') : `**/${pattern}`;
  const alternatives = expandBraces(anchored).map(compileSingle);
  const regex = new RegExp(`^(?:${alternatives.join('|')})$`);
  cache.set(pattern, regex);
  return regex;
}

export function matchesAny(relativePath, patterns) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\//, '');
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
