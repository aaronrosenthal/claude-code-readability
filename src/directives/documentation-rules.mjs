const DOCUMENTATION_RULE_PATTERNS = [
  /^(?:jsdoc\/require-[\w-]+|require-jsdoc|valid-jsdoc)$/,
  /^D(?:1\d{0,2})?$/,
  /^(?:missing-(?:module-|class-|function-)?docstring|empty-docstring|C011[1-6])$/i,
  /^Style\/Documentation(?:Method)?$/,
  /^missing_docs(?:_in_private_items)?$/,
  /^(?:clippy::)?missing_docs_in_private_items$/,
  /^public_member_api_docs$/,
  /^(?:CS)?1591$/,
  /^SA16(?:0[0-9]|1[0-9])$/,
  /^(?:MissingJavadoc\w*|JavadocType|JavadocMethod|JavadocVariable|JavadocPackage)$/i,
  /^UndocumentedPublic\w+$/,
  /^(?:CommentRequired)$/,
  /^(?:exported|ST10(?:00|20|21|22))$/,
  /^Squiz\.Commenting\.\w*Comment/,
];

export function isDocumentationRule(rule) {
  const bare = rule.replace(/^(?:checkstyle|detekt|PMD|pylint|ruff|flake8):/i, '').replace(/^PMD\./, '');
  return DOCUMENTATION_RULE_PATTERNS.some((pattern) => pattern.test(bare));
}

const DOCUMENTATION_SUPPRESSION_CONSTRUCTS = [
  { family: 'rust', pattern: /#!?\[\s*(?:allow|expect)\s*\(([^\]]*)\)\s*\]/g },
  { family: 'csharp', pattern: /^[ \t]*#pragma\s+warning\s+disable\s+([^\n]*)$/gm },
  { family: 'csharp', pattern: /\[\s*(?:assembly:\s*)?SuppressMessage\s*\(([^\]]*)\)\s*\]/g },
  { family: 'java', pattern: /@SuppressWarnings\s*\(([^)]*)\)/g },
  { family: 'kotlin', pattern: /@(?:file:)?Suppress(?:Warnings)?\s*\(([^)]*)\)/g },
];

function rulesInConstruct(argumentText) {
  return argumentText
    .replace(/reason\s*=\s*"[^"]*"/g, '')
    .split(/[\s,{}"'()]+/)
    .map((token) => token.trim())
    .filter((token) => token && !/^(?:value|Justification|Scope|Target|MessageId)\s*=?$/.test(token));
}

export function documentationSuppressionConstructs(family, codeWithoutComments) {
  const found = [];
  for (const { family: constructFamily, pattern } of DOCUMENTATION_SUPPRESSION_CONSTRUCTS) {
    if (constructFamily !== family) continue;
    for (const match of codeWithoutComments.matchAll(pattern)) {
      const rules = rulesInConstruct(match[1]).filter(isDocumentationRule);
      if (/DocumentationRules/.test(match[1])) rules.push('StyleCop.DocumentationRules');
      for (const rule of rules) found.push({ rule, text: match[0].trim(), offset: match.index });
    }
  }
  return found;
}
