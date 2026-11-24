const CLASS_WORDS = 'class|interface|enum|record|struct|trait|protocol|extension|object|union|module|namespace|actor|mixin';

function visibilityFromModifiers(modifiers, defaults) {
  if (/\b(?:private|fileprivate)\b/.test(modifiers)) return 'private';
  if (/\bprotected\b/.test(modifiers)) return 'protected';
  if (/\binternal\b/.test(modifiers)) return 'internal';
  if (/\b(?:public|open|export|pub)\b/.test(modifiers)) return 'public';
  return defaults;
}

const DETECTORS = {
  javascript(line, { indented }) {
    let match = /^(export\s+(?:default\s+)?)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|interface|type|enum|namespace|module)\s+([\w$]+)/.exec(line);
    if (match) {
      const kind = /class|interface|type|enum/.test(match[2]) ? 'class' : /namespace|module/.test(match[2]) ? 'module' : 'function';
      return { kind, name: match[3], visibility: match[1] ? 'public' : 'internal' };
    }
    match = /^(export\s+)?(?:const|let|var)\s+([\w$]+)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:function\b|\(|[\w$]+\s*=>)/.exec(line);
    if (match) return { kind: 'function', name: match[2], visibility: match[1] ? 'public' : 'internal' };
    match = /^(export\s+)?(?:const|let|var)\s+([\w$]+)/.exec(line);
    if (match) return { kind: 'property', name: match[2], visibility: match[1] ? 'public' : 'internal' };
    if (indented) {
      match = /^((?:(?:public|private|protected|static|readonly|async|override|abstract|declare|get|set|accessor)\s+)*)(#?[\w$]+)\s*(?:<[^>]*>)?\s*\(/.exec(line);
      if (match && !/^(?:if|for|while|switch|catch|return|function)$/.test(match[2])) {
        const visibility = match[2].startsWith('#') ? 'private' : visibilityFromModifiers(match[1], 'public');
        return { kind: 'method', name: match[2], visibility };
      }
      match = /^((?:(?:public|private|protected|static|readonly|declare|override)\s+)*)(#?[\w$]+)\??\s*[:=;]/.exec(line);
      if (match) return { kind: 'property', name: match[2], visibility: match[2].startsWith('#') ? 'private' : visibilityFromModifiers(match[1], 'public') };
    }
    return null;
  },
  python(line, { indented }) {
    const match = /^(?:async\s+)?(def|class)\s+(\w+)/.exec(line);
    if (!match) return null;
    const name = match[2];
    const visibility = /^__\w+__$/.test(name) ? 'special' : name.startsWith('_') ? 'private' : 'public';
    if (match[1] === 'class') return { kind: 'class', name, visibility };
    return { kind: indented ? 'method' : 'function', name, visibility };
  },
  go(line) {
    let match = /^func\s+\([^)]*\)\s*(\w+)/.exec(line);
    if (match) return { kind: 'method', name: match[1], visibility: /^[A-Z]/.test(match[1]) ? 'public' : 'private' };
    match = /^(func|type|var|const)\s+(\w+)/.exec(line);
    if (match) {
      const kind = match[1] === 'func' ? 'function' : match[1] === 'type' ? 'class' : 'property';
      return { kind, name: match[2], visibility: /^[A-Z]/.test(match[2]) ? 'public' : 'private' };
    }
    if (/^package\s+\w+/.test(line)) return { kind: 'module', name: line.split(/\s+/)[1], visibility: 'public' };
    return null;
  },
  rust(line) {
    const match =
      /^(pub(?:\([^)]*\))?\s+)?(?:(?:async|const|unsafe|extern(?:\s+"[^"]*")?|default)\s+)*(fn|struct|enum|trait|mod|type|const|static|union|impl|macro_rules!)\s*([\w]+)?/.exec(
        line,
      );
    if (!match) return null;
    const kind = match[2] === 'fn' ? 'function' : match[2] === 'mod' ? 'module' : /const|static/.test(match[2]) ? 'property' : 'class';
    const visibility = match[1] ? (match[1].includes('(') ? 'internal' : 'public') : 'private';
    return { kind, name: match[3] ?? match[2], visibility };
  },
  ruby(line, { indented }) {
    let match = /^(class|module)\s+([\w:]+)/.exec(line);
    if (match) return { kind: 'class', name: match[2], visibility: 'public' };
    match = /^def\s+(self\.)?([\w?!=]+)/.exec(line);
    if (match) return { kind: indented || match[1] ? 'method' : 'function', name: match[2], visibility: 'public' };
    return null;
  },
  cLike(line, { defaultVisibility, indented }) {
    const modifiers =
      '(?:(?:public|private|protected|internal|static|final|abstract|sealed|override|virtual|open|data|inline|suspend|async|export|extern|const|constexpr|partial|readonly|unsafe|new|fileprivate|required|convenience|mutating|nonmutating|lazy|weak|external|factory|late|operator|default|synchronized|native|transient|volatile|strictfp)\\s+)*';
    let match = new RegExp(`^(${modifiers})(?:@\\w+\\s+)*(${CLASS_WORDS}|typealias|typedef)\\s+([\\w.]+)`).exec(line);
    if (match) return { kind: 'class', name: match[3], visibility: visibilityFromModifiers(match[1], defaultVisibility) };
    match = new RegExp(`^(${modifiers})(fun|func|function|def|init|constructor)\\b\\s*(?:<[^>]*>\\s*)?([\\w.]+)?`).exec(line);
    if (match) return { kind: indented ? 'method' : 'function', name: match[3] ?? match[2], visibility: visibilityFromModifiers(match[1], defaultVisibility) };
    match = new RegExp(`^(${modifiers})(?:[\\w.<>,\\[\\]?*&:\\s]+?\\s+)(~?[A-Za-z_]\\w*)\\s*\\(`).exec(line);
    if (match && !/^(?:if|for|while|switch|catch|return|else|new|throw|using|lock|sizeof)$/.test(match[2])) {
      return { kind: indented ? 'method' : 'function', name: match[2], visibility: visibilityFromModifiers(match[1], defaultVisibility) };
    }
    match = new RegExp(`^(${modifiers})(?:val|var|let|const|final)?\\s*([\\w.<>,\\[\\]?]+\\s+)?([A-Za-z_]\\w*)\\s*(?:[:=;{]|$)`).exec(line);
    if (match?.[2] && indented) return { kind: 'property', name: match[3], visibility: visibilityFromModifiers(match[1], defaultVisibility) };
    return null;
  },
};

const C_LIKE_DEFAULT_VISIBILITY = {
  java: 'internal',
  kotlin: 'public',
  csharp: 'private',
  swift: 'internal',
  dart: 'public',
  php: 'public',
  c: 'public',
  cpp: 'public',
};

export function detectDeclaration(family, codeLine) {
  if (!codeLine) return null;
  const indented = /^\s+/.test(codeLine);
  const line = codeLine
    .trim()
    .replace(/^(?:@[\w.]+(?:\([^)]*\))?\s+)+/, '')
    .replace(/^\[[^\]]*\]\s*/, '');
  if (family === 'javascript' || family === 'typescript') return DETECTORS.javascript(line, { indented });
  if (family === 'python') return DETECTORS.python(line, { indented });
  if (family === 'go') return DETECTORS.go(line);
  if (family === 'rust') return DETECTORS.rust(line);
  if (family === 'ruby') return DETECTORS.ruby(line, { indented });
  if (family in C_LIKE_DEFAULT_VISIBILITY) {
    const declaration = DETECTORS.cLike(line, { defaultVisibility: C_LIKE_DEFAULT_VISIBILITY[family], indented });
    if (declaration && family === 'dart' && declaration.name?.startsWith('_')) declaration.visibility = 'private';
    if (declaration && family === 'csharp' && declaration.kind === 'class' && declaration.visibility === 'private' && !indented) declaration.visibility = 'internal';
    return declaration;
  }
  return null;
}

export function isExposed(visibility) {
  return visibility === 'public' || visibility === 'protected';
}
