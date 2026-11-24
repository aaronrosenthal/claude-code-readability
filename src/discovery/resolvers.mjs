import { parseIni, parseJsonc, parseTomlLite, parseYamlLite, stripJsComments, stripXmlComments } from './parsers.mjs';

const ALL_KINDS = ['module', 'class', 'function', 'method', 'property'];

function requirement({ family, tool, rule, file, kinds, visibility = 'public', excludes = [] }) {
  return { status: 'required', family, tool, rule, file, kinds, visibility, excludes, source: `${tool} ${rule} (${file})` };
}

function unresolved({ family, tool, file, why }) {
  return { status: 'unknown', family, tool, file, kinds: ALL_KINDS, visibility: 'all', excludes: [], source: `${tool} (${file}): ${why}` };
}

function asList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value)
    ? value.map(String)
    : String(value)
        .split(/[\s,]+/)
        .filter(Boolean);
}

export const RESOLVERS = [];

function resolver(definition) {
  RESOLVERS.push(definition);
}

function rubocopCopEnabled(config, cop, enabledByDefault) {
  const entry = config?.[cop];
  if (entry && typeof entry === 'object' && 'Enabled' in entry) return entry.Enabled !== false && entry.Enabled !== 'false';
  if (config?.AllCops && typeof config.AllCops === 'object' && config.AllCops.DisabledByDefault === true) return false;
  return enabledByDefault;
}

function loadRubocopChain(read, file, depth = 0, seen = new Set()) {
  if (depth > 5 || seen.has(file)) return { configs: [], unresolvedReasons: [] };
  seen.add(file);
  const text = read(file);
  if (text === null) return { configs: [], unresolvedReasons: [] };
  const parsed = parseYamlLite(text);
  if (!parsed) return { configs: [], unresolvedReasons: [`could not parse ${file}`] };
  const unresolvedReasons = [];
  const configs = [];
  for (const inherited of asList(parsed.inherit_from)) {
    if (/^https?:/.test(inherited)) {
      unresolvedReasons.push(`remote inherit_from ${inherited}`);
      continue;
    }
    const chain = loadRubocopChain(read, inherited, depth + 1, seen);
    configs.push(...chain.configs);
    unresolvedReasons.push(...chain.unresolvedReasons);
  }
  if (parsed.inherit_gem) unresolvedReasons.push('inherit_gem configuration is not resolved');
  configs.push(parsed);
  return { configs, unresolvedReasons };
}

resolver({
  id: 'rubocop',
  family: 'ruby',
  files: ['.rubocop.yml', '.rubocop_todo.yml', '.standard.yml'],
  resolve(read) {
    if (read('.standard.yml') !== null && read('.rubocop.yml') === null) return [];
    if (read('.rubocop.yml') === null) return [];
    const { configs, unresolvedReasons } = loadRubocopChain(read, '.rubocop.yml');
    const merged = Object.assign({}, ...configs);
    const mergesExclude = asList(merged.inherit_mode?.merge).includes('Exclude');
    const results = [];
    const cops = [
      { cop: 'Style/Documentation', enabledByDefault: true, kinds: ['class'] },
      { cop: 'Style/DocumentationMethod', enabledByDefault: false, kinds: ['method', 'function'] },
    ];
    for (const { cop, enabledByDefault, kinds } of cops) {
      if (!rubocopCopEnabled(merged, cop, enabledByDefault)) continue;
      const explicitlyEnabled = merged[cop]?.Enabled === true || merged[cop]?.Enabled === 'true';
      if (unresolvedReasons.length > 0 && !explicitlyEnabled) continue;
      const configured = merged[cop]?.Exclude;
      const defaults = ['spec/**/*', 'test/**/*'];
      const excludes = configured === undefined ? defaults : [...asList(configured), ...(mergesExclude ? defaults : [])];
      results.push(requirement({ family: 'ruby', tool: 'RuboCop', rule: cop, file: '.rubocop.yml', kinds, excludes }));
    }
    if (unresolvedReasons.length > 0) results.push(unresolved({ family: 'ruby', tool: 'RuboCop', file: '.rubocop.yml', why: unresolvedReasons.join('; ') }));
    return results;
  },
});

const ESLINT_FLAT_FILES = ['eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs', 'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts'];
const ESLINT_LEGACY_FILES = ['.eslintrc.json', '.eslintrc', '.eslintrc.yml', '.eslintrc.yaml', '.eslintrc.js', '.eslintrc.cjs'];

function jsdocKindsFromOptions(text) {
  const kinds = new Set(['function']);
  if (/ClassDeclaration\s*["']?\s*:\s*true/.test(text) || /ClassExpression\s*["']?\s*:\s*true/.test(text)) kinds.add('class');
  if (/MethodDefinition\s*["']?\s*:\s*true/.test(text)) kinds.add('method');
  if (/(?:ArrowFunctionExpression|FunctionExpression)\s*["']?\s*:\s*true/.test(text)) kinds.add('function');
  return [...kinds];
}

function eslintRuleState(text, rule) {
  const escaped = rule.replace(/[/\\-]/g, '\\$&');
  const match = new RegExp(`["']${escaped}["']\\s*:\\s*(\\[[^\\]]*\\]|"[^"]*"|'[^']*'|\\d)`).exec(text);
  if (!match) return null;
  const severity = /^\[/.test(match[1]) ? /^\[\s*("[^"]*"|'[^']*'|\d)/.exec(match[1])?.[1] : match[1];
  return { enabled: !/^(?:"off"|'off'|0)$/.test(severity ?? ''), options: match[1] };
}

resolver({
  id: 'eslint',
  family: 'javascript',
  families: ['javascript', 'typescript'],
  files: [...ESLINT_FLAT_FILES, ...ESLINT_LEGACY_FILES, 'package.json'],
  resolve(read) {
    const results = [];
    for (const file of [...ESLINT_FLAT_FILES, ...ESLINT_LEGACY_FILES, 'package.json']) {
      const raw = read(file);
      if (raw === null) continue;
      let text = raw;
      if (file === 'package.json') {
        const parsed = parseJsonc(raw);
        if (!parsed?.eslintConfig) continue;
        text = JSON.stringify(parsed.eslintConfig);
      } else if (/\.(?:c|m)?[jt]s$/.test(file)) {
        text = stripJsComments(raw, file.endsWith('ts') ? 'typescript' : 'javascript') ?? raw;
      } else if (/\.ya?ml$/.test(file)) {
        text = JSON.stringify(parseYamlLite(raw) ?? {});
      }
      const explicit = eslintRuleState(text, 'jsdoc/require-jsdoc') ?? eslintRuleState(text, 'require-jsdoc');
      const recommended = /jsdoc\.configs\s*(?:\.|\[\s*["'])\s*(?:flat\/)?recommended|plugin:jsdoc\/recommended|["']jsdoc\/recommended/.test(text);
      const isExecutable = /\.(?:c|m)?[jt]s$/.test(file);
      for (const family of ['javascript', 'typescript']) {
        if (explicit?.enabled || (!explicit && recommended)) {
          const kinds = explicit ? jsdocKindsFromOptions(explicit.options) : ['function'];
          const publicOnly = explicit ? /publicOnly\s*["']?\s*:\s*(?:true|\{)/.test(explicit.options) : false;
          results.push(requirement({ family, tool: 'ESLint', rule: 'jsdoc/require-jsdoc', file, kinds, visibility: publicOnly ? 'public' : 'all' }));
        }
        const mentionsJsdocIndirectly = isExecutable && !explicit && !recommended && /jsdoc/i.test(text);
        if (mentionsJsdocIndirectly) {
          results.push(unresolved({ family, tool: 'ESLint', file, why: 'executable config references eslint-plugin-jsdoc through code that is not evaluated' }));
        }
      }
      break;
    }
    return results;
  },
});

function pythonSelection(select, extend, ignore) {
  const selected = [...asList(select), ...asList(extend)];
  const ignored = asList(ignore);
  const kinds = new Set();
  const map = { D100: 'module', D104: 'module', D101: 'class', D106: 'class', D102: 'method', D105: 'method', D107: 'method', D103: 'function' };
  for (const [code, kind] of Object.entries(map)) {
    const isSelected = selected.some((entry) => entry === 'ALL' || code.startsWith(entry)) && selected.some((entry) => entry === 'ALL' || /^D/.test(entry));
    const isIgnored = ignored.some((entry) => code.startsWith(entry));
    if (isSelected && !isIgnored) kinds.add(kind);
  }
  return [...kinds];
}

resolver({
  id: 'ruff',
  family: 'python',
  files: ['.ruff.toml', 'ruff.toml', 'pyproject.toml'],
  resolve(read) {
    for (const file of ['.ruff.toml', 'ruff.toml', 'pyproject.toml']) {
      const raw = read(file);
      if (raw === null) continue;
      const parsed = parseTomlLite(raw);
      if (!parsed) return [unresolved({ family: 'python', tool: 'Ruff', file, why: 'could not parse' })];
      const root = file === 'pyproject.toml' ? parsed.tool?.ruff : parsed;
      if (!root) continue;
      const lint = root.lint ?? {};
      const kinds = pythonSelection(lint.select ?? root.select, lint['extend-select'] ?? root['extend-select'], lint.ignore ?? root.ignore);
      const results = [];
      if (kinds.length > 0) {
        const perFileIgnores = Object.entries(lint['per-file-ignores'] ?? root['per-file-ignores'] ?? {})
          .filter(([, codes]) => asList(codes).some((code) => /^D1?/.test(code)))
          .map(([glob]) => glob);
        results.push(requirement({ family: 'python', tool: 'Ruff', rule: 'pydocstyle (D1xx)', file, kinds, visibility: 'public', excludes: perFileIgnores }));
      }
      if (root.extend) results.push(unresolved({ family: 'python', tool: 'Ruff', file, why: `extends ${root.extend}, which is not resolved` }));
      return results;
    }
    return [];
  },
});

const PYLINT_DOCSTRING_MESSAGES = [
  ['module', /missing-module-docstring|C0114|missing-docstring|C0111/],
  ['class', /missing-class-docstring|C0115|missing-docstring|C0111/],
  ['function', /missing-function-docstring|C0116|missing-docstring|C0111/],
  ['method', /missing-function-docstring|C0116|missing-docstring|C0111/],
];

resolver({
  id: 'pylint',
  family: 'python',
  files: ['.pylintrc', 'pylintrc', 'pyproject.toml', 'setup.cfg'],
  resolve(read) {
    let disabled = null;
    let file = null;
    for (const candidate of ['.pylintrc', 'pylintrc']) {
      const raw = read(candidate);
      if (raw === null) continue;
      const ini = parseIni(raw);
      disabled = Object.values(ini)
        .map((section) => section.disable ?? '')
        .join(',');
      file = candidate;
      break;
    }
    if (!file) {
      const pyproject = read('pyproject.toml');
      const parsed = pyproject ? parseTomlLite(pyproject) : null;
      if (parsed?.tool?.pylint) {
        file = 'pyproject.toml';
        const control = parsed.tool.pylint.messages_control ?? parsed.tool.pylint['MESSAGES CONTROL'] ?? parsed.tool.pylint;
        disabled = asList(control.disable).join(',');
      }
    }
    if (!file) {
      const setup = read('setup.cfg');
      const ini = setup ? parseIni(setup) : {};
      const sections = Object.entries(ini).filter(([name]) => /^pylint/.test(name));
      if (sections.length > 0) {
        file = 'setup.cfg';
        disabled = sections.map(([, section]) => section.disable ?? '').join(',');
      }
    }
    if (!file) return [];
    const kinds = PYLINT_DOCSTRING_MESSAGES.filter(([, pattern]) => !pattern.test(disabled ?? '')).map(([kind]) => kind);
    if (/\ball\b/.test(disabled ?? '')) return [];
    return kinds.length > 0 ? [requirement({ family: 'python', tool: 'Pylint', rule: 'C0114-C0116', file, kinds, visibility: 'public' })] : [];
  },
});

resolver({
  id: 'pydocstyle',
  family: 'python',
  files: ['.pydocstyle', '.pydocstyle.ini', '.pydocstylerc', '.pydocstylerc.ini', 'setup.cfg', 'tox.ini', 'pyproject.toml'],
  resolve(read) {
    for (const file of ['.pydocstyle', '.pydocstyle.ini', '.pydocstylerc', '.pydocstylerc.ini', 'setup.cfg', 'tox.ini']) {
      const raw = read(file);
      if (raw === null) continue;
      const section = parseIni(raw).pydocstyle;
      if (!section) continue;
      const kinds = pythonSelection(section.select ?? 'D', section.add_select, `${section.ignore ?? ''},${section.add_ignore ?? ''}`);
      return kinds.length > 0 ? [requirement({ family: 'python', tool: 'pydocstyle', rule: 'D1xx', file, kinds })] : [];
    }
    const pyproject = read('pyproject.toml');
    const parsed = pyproject ? parseTomlLite(pyproject) : null;
    const section = parsed?.tool?.pydocstyle;
    if (!section) return [];
    const kinds = pythonSelection(section.select ?? 'D', section.add_select, [...asList(section.ignore), ...asList(section.add_ignore)]);
    return kinds.length > 0 ? [requirement({ family: 'python', tool: 'pydocstyle', rule: 'D1xx', file: 'pyproject.toml', kinds })] : [];
  },
});

const CHECKSTYLE_FILES = ['checkstyle.xml', 'config/checkstyle/checkstyle.xml', 'config/checkstyle.xml', '.checkstyle.xml'];

resolver({
  id: 'checkstyle',
  family: 'java',
  files: CHECKSTYLE_FILES,
  resolve(read) {
    for (const file of CHECKSTYLE_FILES) {
      const raw = read(file);
      if (raw === null) continue;
      const xml = stripXmlComments(raw);
      const results = [];
      const modules = [...xml.matchAll(/<module\s+name\s*=\s*"(MissingJavadocType|MissingJavadocMethod|MissingJavadocPackage)"\s*(\/>|>([\s\S]*?)<\/module>)/g)];
      for (const [, name, , inner = ''] of modules) {
        const scope = /<property\s+name\s*=\s*"scope"\s+value\s*=\s*"(\w+)"/.exec(inner)?.[1] ?? 'public';
        const kinds = name === 'MissingJavadocType' ? ['class'] : name === 'MissingJavadocMethod' ? ['method', 'function'] : ['module'];
        const visibility = scope === 'public' ? 'public' : scope === 'protected' ? 'protected' : 'all';
        results.push(requirement({ family: 'java', tool: 'Checkstyle', rule: name, file, kinds, visibility }));
      }
      return results;
    }
    return [];
  },
});

resolver({
  id: 'swiftlint',
  family: 'swift',
  files: ['.swiftlint.yml'],
  resolve(read) {
    const raw = read('.swiftlint.yml');
    if (raw === null) return [];
    const parsed = parseYamlLite(raw) ?? {};
    const enabled =
      asList(parsed.only_rules).includes('missing_docs') || (asList(parsed.opt_in_rules).includes('missing_docs') && !asList(parsed.disabled_rules).includes('missing_docs'));
    const results = [];
    if (enabled) results.push(requirement({ family: 'swift', tool: 'SwiftLint', rule: 'missing_docs', file: '.swiftlint.yml', kinds: ALL_KINDS, visibility: 'public' }));
    if (parsed.parent_config || parsed.child_config)
      results.push(unresolved({ family: 'swift', tool: 'SwiftLint', file: '.swiftlint.yml', why: 'parent/child configs are not resolved' }));
    return results;
  },
});

function editorconfigSeverity(raw, rule) {
  if (raw === null) return null;
  const match = new RegExp(`dotnet_diagnostic\\.${rule}\\.severity\\s*=\\s*(\\w+)`, 'i').exec(raw);
  return match ? match[1].toLowerCase() : null;
}

export function dotnetProjectRequirements(file, raw, editorconfig) {
  const xml = stripXmlComments(raw);
  const results = [];
  const generates = /<GenerateDocumentationFile>\s*true\s*<\/GenerateDocumentationFile>/i.test(xml) || /<DocumentationFile>\s*\S+\s*<\/DocumentationFile>/i.test(xml);
  const noWarn = /<NoWarn>[^<]*\b(?:CS)?1591\b[^<]*<\/NoWarn>/i.test(xml);
  const severity = editorconfigSeverity(editorconfig, 'CS1591');
  if (generates && !noWarn && severity !== 'none' && severity !== 'silent') {
    results.push(requirement({ family: 'csharp', tool: '.NET compiler', rule: 'CS1591', file, kinds: ALL_KINDS, visibility: 'public' }));
  }
  if (/StyleCop\.Analyzers/i.test(xml) && !['none', 'silent'].includes(editorconfigSeverity(editorconfig, 'SA1600') ?? '')) {
    results.push(requirement({ family: 'csharp', tool: 'StyleCop.Analyzers', rule: 'SA1600', file, kinds: ALL_KINDS, visibility: 'non-private' }));
  }
  return results;
}

resolver({
  id: 'dotnet',
  family: 'csharp',
  files: ['Directory.Build.props', '.editorconfig', 'stylecop.json'],
  resolve(read, list) {
    const projectFiles = ['Directory.Build.props', ...list().filter((name) => /\.csproj$/.test(name))];
    const editorconfig = read('.editorconfig');
    return projectFiles.flatMap((file) => {
      const raw = read(file);
      return raw === null ? [] : dotnetProjectRequirements(file, raw, editorconfig);
    });
  },
});

resolver({
  id: 'dart',
  family: 'dart',
  files: ['analysis_options.yaml'],
  resolve(read) {
    const raw = read('analysis_options.yaml');
    if (raw === null) return [];
    const parsed = parseYamlLite(raw) ?? {};
    const rules = parsed.linter?.rules;
    const listed = Array.isArray(rules) ? rules.includes('public_member_api_docs') : rules && typeof rules === 'object' ? rules.public_member_api_docs === true : false;
    const results = [];
    if (listed)
      results.push(
        requirement({ family: 'dart', tool: 'Dart analyzer', rule: 'public_member_api_docs', file: 'analysis_options.yaml', kinds: ALL_KINDS, visibility: 'public', excludes: [] }),
      );
    if (parsed.include && !/^package:(?:lints|flutter_lints)\//.test(String(parsed.include))) {
      results.push(unresolved({ family: 'dart', tool: 'Dart analyzer', file: 'analysis_options.yaml', why: `include ${parsed.include} is not resolved` }));
    }
    return results;
  },
});

resolver({
  id: 'rust',
  family: 'rust',
  files: ['Cargo.toml', 'src/lib.rs'],
  resolve(read) {
    const cargo = read('Cargo.toml');
    const parsed = cargo ? parseTomlLite(cargo) : null;
    const lintLevel = parsed?.lints?.rust?.missing_docs ?? parsed?.workspace?.lints?.rust?.missing_docs;
    const level = typeof lintLevel === 'object' ? lintLevel?.level : lintLevel;
    const lib = read('src/lib.rs');
    const attribute = lib ? /#!\[\s*(warn|deny|forbid)\s*\([^)]*\bmissing_docs\b/.exec(lib) : null;
    if ((level && level !== 'allow') || attribute) {
      return [requirement({ family: 'rust', tool: 'rustc', rule: 'missing_docs', file: attribute ? 'src/lib.rs' : 'Cargo.toml', kinds: ALL_KINDS, visibility: 'public' })];
    }
    return [];
  },
});

resolver({
  id: 'revive',
  family: 'go',
  files: ['.golangci.yml', '.golangci.yaml', 'revive.toml', '.revive.toml'],
  resolve(read) {
    for (const file of ['.golangci.yml', '.golangci.yaml']) {
      const raw = read(file);
      if (raw === null) continue;
      const parsed = parseYamlLite(raw) ?? {};
      const enabled = asList(parsed.linters?.enable).includes('revive');
      const rules = parsed.linters?.settings?.revive?.rules ?? parsed['linters-settings']?.revive?.rules;
      const exported = Array.isArray(rules) && rules.some((rule) => rule?.name === 'exported' && rule.disabled !== true);
      if (enabled && exported) return [requirement({ family: 'go', tool: 'revive', rule: 'exported', file, kinds: ALL_KINDS, visibility: 'public' })];
      return [];
    }
    return [];
  },
});

export const DISCOVERY_FILES = new Set(RESOLVERS.flatMap((definition) => definition.files));

export function isDiscoveryFile(relativePath) {
  if (DISCOVERY_FILES.has(relativePath)) return true;
  return /\.csproj$/.test(relativePath);
}
