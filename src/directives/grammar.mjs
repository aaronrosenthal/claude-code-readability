export const SCOPE_RANK = { line: 1, 'next-line': 1, statement: 1, region: 2, file: 3 };

export function splitRuleList(text, separators = /[\s,]+/) {
  if (!text) return [];
  return text
    .split(separators)
    .map((rule) => rule.trim())
    .filter(Boolean);
}

export function splitDoubleDashDescription(text) {
  const match = /\s-{2,}\s*(.*)$/s.exec(text);
  if (!match) return { head: text.trim(), description: null };
  return { head: text.slice(0, match.index).trim(), description: match[1].trim() || null };
}

export function suppression({ rules = [], scope, justification = null, justificationSyntax = null, trailing = '' }) {
  return {
    kind: 'suppression',
    rules,
    blanket: rules.length === 0 || rules.some((rule) => /^(?:all|\*)$/i.test(rule)),
    scope,
    justification: justification?.trim() || null,
    justificationSyntax,
    trailing: trailing.trim(),
  };
}

export function pragma(kind = 'pragma', { trailing = '', detail = null } = {}) {
  return { kind, trailing: trailing.trim(), detail };
}

export function inlineConfigDisablesRule(value) {
  return /^\s*(?:"off"|'off'|off|0|false|"false"|'false'|none|"none")\s*$/i.test(value);
}
