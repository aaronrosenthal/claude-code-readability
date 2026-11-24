const STOPWORDS = new Set(
  `a an the to of and or for in on with is are be been being this that these those it its we our you your
  by as at from if then else when so do does did will would can could should may might must here there now
  just also only into onto over under than very same such some any each every all both either neither not no
  yes up down out off again further once which who whom whose what where why how let lets let's i me my mine
  them they their theirs he she his her us via per`.split(/\s+/),
);

const CODE_CONCEPTS = [
  [/\b(?:for|while|foreach|loop|each|forEach|map|filter|reduce|iter|range|times)\b/, ['loop', 'iterate', 'over', 'each', 'go', 'through']],
  [/\breturn\b/, ['return', 'result', 'give', 'back']],
  [/\b(?:if|elif|else|unless|switch|case|when|match|guard)\b/, ['check', 'whether', 'condition', 'case']],
  [/\+\+|\+=\s*1\b/, ['increment', 'increase', 'add', 'one', 'counter']],
  [/--|-=\s*1\b/, ['decrement', 'decrease', 'subtract']],
  [/\b(?:throw|raise|panic|Err|error)\b/, ['throw', 'raise', 'error', 'fail', 'exception']],
  [/\b(?:await|async|then)\b/, ['wait', 'await', 'async', 'asynchronously']],
  [/\b(?:import|require|use|include|from)\b/, ['import', 'load', 'require']],
  [/\b(?:new|const|let|var|val|:=|=)\b|=/, ['create', 'initialize', 'init', 'set', 'assign', 'store', 'declare', 'define', 'variable', 'make']],
  [/\b(?:try|catch|except|rescue|finally)\b/, ['handle', 'catch', 'error', 'try']],
  [/\b(?:print|println|console|log|logger|puts|echo|printf)\b/, ['print', 'log', 'output', 'write']],
  [/\b(?:sort|sorted|order)\b/, ['sort', 'order']],
  [/\b(?:push|append|add|insert)\b/, ['add', 'append', 'push', 'insert']],
  [/\b(?:len|length|size|count)\b/, ['count', 'length', 'size', 'number']],
  [/\b(?:true|false|True|False)\b/, ['true', 'false', 'flag']],
  [/\b(?:null|nil|None|undefined)\b/, ['null', 'empty', 'nothing', 'none']],
];

export function stem(word) {
  if (word.length <= 3) return word;
  return word
    .replace(/ies$/, 'y')
    .replace(/(?:ing|ed)$/, '')
    .replace(/(?:es|s)$/, '')
    .replace(/e$/, '');
}

export function contentWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []).filter((word) => !STOPWORDS.has(word)).map(stem);
}

export function wordCount(text) {
  return (text.match(/[\p{L}\p{N}]+/gu) ?? []).length;
}

export function identifierWords(code) {
  const words = new Set();
  for (const identifier of code.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
    if (/^_+$/.test(identifier)) continue;
    for (const part of identifier.split(/_+|(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/)) {
      if (part) words.add(stem(part.toLowerCase()));
    }
  }
  for (const [pattern, concepts] of CODE_CONCEPTS) if (pattern.test(code)) for (const concept of concepts) words.add(stem(concept));
  return words;
}

function originalContentWords(text) {
  return (text.toLowerCase().match(/[a-z][a-z0-9]*/g) ?? []).filter((word) => !STOPWORDS.has(word));
}

export function overlapRatio(commentText, code) {
  const originals = originalContentWords(commentText);
  if (originals.length === 0) return { ratio: 0, shared: [], total: 0 };
  const codeWords = identifierWords(code);
  const matchedOriginals = originals.filter((word) => codeWords.has(stem(word)));
  return { ratio: matchedOriginals.length / originals.length, shared: [...new Set(matchedOriginals)], total: originals.length };
}

export function similarity(a, b) {
  const left = new Set(contentWords(a));
  const right = new Set(contentWords(b));
  if (left.size === 0 && right.size === 0) return a.trim() === b.trim() ? 1 : 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return (2 * shared) / (left.size + right.size);
}

export function normalizeCommentText(text) {
  return text.replace(/\r/g, '').replace(/\s+/g, ' ').trim();
}
