import { inlineConfigDisablesRule, pragma, splitDoubleDashDescription, splitRuleList, suppression } from './grammar.mjs';

const JS = ['javascript', 'typescript'];
const MARKUP = ['html', 'vue', 'svelte', 'xml'];
const C_STYLE = ['c', 'cpp'];
const JVM = ['java', 'kotlin'];

const DEFINITIONS = [];

function define(definition) {
  DEFINITIONS.push(definition);
}

define({
  id: 'eslint',
  tool: 'ESLint',
  toolKey: 'eslint',
  families: [...JS, 'vue', 'svelte', 'html'],
  url: 'https://eslint.org/docs/latest/use/configure/rules#using-configuration-comments-1',
  match({ body }) {
    const directive = /^(?:eslint|oxlint)-(disable-next-line|disable-line|disable|enable)(?=\s|$)(.*)$/s.exec(body);
    if (directive) {
      const { head, description } = splitDoubleDashDescription(directive[2]);
      const rules = splitRuleList(head, /\s*,\s*/);
      if (directive[1] === 'enable') return pragma('suppression-end');
      const scope = directive[1] === 'disable' ? 'region' : directive[1] === 'disable-line' ? 'line' : 'next-line';
      return suppression({ rules, scope, justification: description, justificationSyntax: ' -- ' });
    }
    const inlineConfig = /^eslint\s+((?:@?[\w-]+\/)?[\w-]+\s*:.*)$/s.exec(body);
    if (inlineConfig) {
      const { head, description } = splitDoubleDashDescription(inlineConfig[1]);
      const disabled = [...head.matchAll(/((?:@?[\w-]+\/)?[\w-]+)\s*:\s*("[^"]*"|'[^']*'|\[[^\]]*\]|\d+)/g)]
        .filter(([, , value]) => inlineConfigDisablesRule(value))
        .map(([, rule]) => rule);
      if (disabled.length > 0) return suppression({ rules: disabled, scope: 'file', justification: description, justificationSyntax: ' -- ' });
      return pragma('config');
    }
    if (/^(?:globals?|exported)\s+[\w$]/.test(body)) return pragma('config');
    if (/^eslint-env\s+\w/.test(body)) return pragma('config', { detail: 'eslint-env is not supported by flat config' });
    return null;
  },
});

define({
  id: 'typescript',
  tool: 'TypeScript',
  toolKey: 'typescript',
  families: JS,
  url: 'https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#-ts-expect-error-comments',
  match({ body, raw, comment }) {
    const directive = /^@ts-(ignore|expect-error|nocheck|check)(?=\s|$)(.*)$/s.exec(body);
    if (directive) {
      const [, name, rest] = directive;
      if (name === 'check') return pragma('pragma', { trailing: rest });
      const scope = name === 'nocheck' ? 'file' : 'next-line';
      return suppression({ rules: [`ts-${name}`], scope, justification: rest.replace(/^[\s:-]+/, ''), justificationSyntax: 'trailing description' });
    }
    if (comment.marker === '//' && /^\/\s*<(?:reference|amd-module|amd-dependency)\b[^>]*\/>\s*$/.test(raw)) return pragma('pragma');
    return null;
  },
});

define({
  id: 'biome',
  tool: 'Biome',
  toolKey: 'biome',
  families: [...JS, 'css', 'html', 'vue', 'svelte'],
  url: 'https://biomejs.dev/analyzer/suppressions/',
  match({ body }) {
    const directive = /^biome-ignore(-all|-start|-end)?\s+([\w/().-]+)(?::\s*(.*))?$/s.exec(body);
    if (!directive) return null;
    if (directive[1] === '-end') return pragma('suppression-end');
    const scope = directive[1] === '-all' ? 'file' : directive[1] === '-start' ? 'region' : 'next-line';
    const rule = directive[2];
    return suppression({ rules: /^(?:lint|assist|syntax)$/.test(rule) ? [] : [rule], scope, justification: directive[3], justificationSyntax: ': ' });
  },
});

define({
  id: 'prettier',
  tool: 'Prettier',
  toolKey: 'prettier',
  families: [...JS, 'css', 'yaml', ...MARKUP],
  url: 'https://prettier.io/docs/ignore',
  match({ body }) {
    if (/^prettier-ignore(?:-start|-end|-attribute(?:\s+\([^)]*\))?)?$/.test(body)) return pragma('formatting');
    if (/^@(?:format|prettier)$/.test(body)) return pragma('formatting');
    return null;
  },
});

define({
  id: 'stylelint',
  tool: 'Stylelint',
  toolKey: 'stylelint',
  families: ['css', ...JS, 'vue', 'svelte', 'html'],
  url: 'https://stylelint.io/user-guide/ignore-code/',
  match({ body }) {
    const directive = /^stylelint-(disable-next-line|disable-line|disable|enable)(?=\s|$)(.*)$/s.exec(body);
    if (!directive) return null;
    if (directive[1] === 'enable') return pragma('suppression-end');
    const { head, description } = splitDoubleDashDescription(directive[2]);
    const scope = directive[1] === 'disable' ? 'region' : directive[1] === 'disable-line' ? 'line' : 'next-line';
    return suppression({ rules: splitRuleList(head, /\s*,\s*/), scope, justification: description, justificationSyntax: ' -- ' });
  },
});

define({
  id: 'js-coverage',
  tool: 'Istanbul / c8 / Node.js test runner / Vitest',
  toolKey: 'coverage',
  families: JS,
  url: 'https://github.com/istanbuljs/nyc#parsing-hints-ignoring-lines',
  match({ body }) {
    const istanbul = /^istanbul\s+ignore\s+(if|else|next|file)\b(.*)$/s.exec(body);
    if (istanbul) {
      return suppression({
        rules: ['coverage'],
        scope: istanbul[1] === 'file' ? 'file' : 'statement',
        justification: istanbul[2].replace(/^[\s:-]+/, '').replace(/@preserve/, ''),
        justificationSyntax: 'trailing text',
      });
    }
    const c8 = /^(c8|v8)\s+ignore\s+(next(?:\s+\d+)?|start|stop|if|else|file)\b(.*)$/s.exec(body);
    if (c8) {
      if (c8[2] === 'stop') return pragma('suppression-end');
      return suppression({
        rules: ['coverage'],
        scope: c8[2] === 'start' ? 'region' : c8[2] === 'file' ? 'file' : 'statement',
        justification: c8[3].replace(/^[\s:-]+/, '').replace(/@preserve/, ''),
        justificationSyntax: 'trailing text',
      });
    }
    const node = /^node:coverage\s+(disable|enable|ignore\s+next(?:\s+\d+)?)$/.exec(body);
    if (node) {
      if (node[1] === 'enable') return pragma('suppression-end');
      return suppression({ rules: ['coverage'], scope: node[1] === 'disable' ? 'region' : 'statement' });
    }
    return null;
  },
});

define({
  id: 'bundler-annotations',
  tool: 'Rollup / esbuild / webpack / terser / Vite',
  toolKey: 'bundler',
  families: JS,
  url: 'https://rollupjs.org/configuration-options/#treeshake-annotations',
  match({ body, comment }) {
    if (comment.style !== 'block') return null;
    if (/^[#@]__(?:PURE|NO_SIDE_EFFECTS|INLINE|NOINLINE|KEY|MANGLE_PROP)__$/.test(body)) return pragma('pragma');
    if (/^webpack[A-Z]\w*\s*:\s*\S[\s\S]*$/.test(body) && body.split(/,(?=\s*webpack)/).every((part) => /^\s*webpack[A-Z]\w*\s*:\s*\S/.test(part))) {
      return pragma('pragma');
    }
    if (/^@vite-ignore$/.test(body)) return pragma('pragma');
    return null;
  },
});

define({
  id: 'source-map',
  tool: 'Source maps (ECMA-426)',
  toolKey: 'sourcemap',
  families: [...JS, 'css'],
  url: 'https://tc39.es/ecma426/',
  match({ raw }) {
    if (/^[#@]\s*source(?:Mapping)?URL=\S*\s*$/.test(raw.trim())) return pragma('metadata');
    return null;
  },
});

define({
  id: 'jsx-pragma',
  tool: 'TypeScript / Babel JSX',
  toolKey: 'jsx',
  families: JS,
  url: 'https://babeljs.io/docs/babel-plugin-transform-react-jsx',
  match({ body }) {
    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length > 0 && lines.every((line) => /^@(?:jsx|jsxFrag|jsxImportSource|jsxRuntime)\s+[\w.@/-]+$/.test(line))) return pragma('pragma');
    return null;
  },
});

define({
  id: 'flow',
  tool: 'Flow',
  toolKey: 'flow',
  families: ['javascript'],
  url: 'https://flow.org/en/docs/errors/',
  match({ body }) {
    if (/^@(?:flow(?:\s+strict(?:-local)?)?|noflow)$/.test(body)) return pragma('pragma');
    const suppressionComment = /^\$(FlowFixMe|FlowExpectedError|FlowIssue)(?:\[([\w-]+)\])?(.*)$/s.exec(body);
    if (suppressionComment) {
      return suppression({
        rules: suppressionComment[2] ? [suppressionComment[2]] : [],
        scope: 'next-line',
        justification: suppressionComment[3],
        justificationSyntax: 'trailing text',
      });
    }
    return null;
  },
});

define({
  id: 'vue-svelte-markup',
  tool: 'Svelte compiler / HTMLHint',
  toolKey: 'markup',
  families: MARKUP,
  url: 'https://svelte.dev/docs/svelte/basic-markup#Comments',
  match({ body }) {
    const svelte = /^svelte-ignore\s+([\w-]+(?:[\s,]+[\w-]+)*)\s*(?:\((.*)\))?$/s.exec(body);
    if (svelte) return suppression({ rules: splitRuleList(svelte[1]), scope: 'statement', justification: svelte[2], justificationSyntax: '(note)' });
    const htmlhint = /^htmlhint(-disable-next-line|-disable|-enable)?(?:\s+(.*))?$/s.exec(body);
    if (htmlhint) {
      if (htmlhint[1] === '-enable') return pragma('suppression-end');
      if (!htmlhint[1]) return pragma('config');
      return suppression({ rules: splitRuleList(htmlhint[2]), scope: htmlhint[1] === '-disable' ? 'region' : 'next-line' });
    }
    if (/^\[if\s[^\]]+\]>|^<!\[endif\]$/.test(body) || /^#(?:include|echo|set|if|elif|else|endif)\b/.test(body)) return pragma('pragma');
    if (/^\/?ko(?:\s|$)/.test(body)) return pragma('pragma');
    return null;
  },
});

define({
  id: 'python-noqa',
  tool: 'Ruff / Flake8',
  toolKey: 'ruff',
  families: ['python'],
  url: 'https://docs.astral.sh/ruff/linter/#error-suppression',
  match({ body }) {
    const lineLevel = /^noqa(?::\s?([A-Z]+[0-9]+(?:[,\s]+[A-Z]+[0-9]+)*))?(?=\s|$|:)(.*)$/is.exec(body);
    if (lineLevel) {
      const rules = splitRuleList(lineLevel[1]);
      return suppression({ rules, scope: 'line', justification: lineLevel[2].replace(/^[\s:,]+/, ''), justificationSyntax: 'trailing text (ignored by Ruff and Flake8)' });
    }
    const fileLevel = /^(?:ruff|flake8)\s*:\s*noqa(?::\s*([A-Z]+[0-9]+(?:[,\s]+[A-Z]+[0-9]+)*))?\s*$/i.exec(body);
    if (fileLevel) return suppression({ rules: splitRuleList(fileLevel[1]), scope: 'file' });
    const ruffRange = /^ruff:\s*(ignore|disable|enable|file-ignore)\[([^\]]+)\]\s*$/.exec(body);
    if (ruffRange) {
      if (ruffRange[1] === 'enable') return pragma('suppression-end');
      const scope = { ignore: 'line', disable: 'region', 'file-ignore': 'file' }[ruffRange[1]];
      return suppression({ rules: splitRuleList(ruffRange[2], /\s*,\s*/), scope });
    }
    return null;
  },
});

define({
  id: 'pylint',
  tool: 'Pylint',
  toolKey: 'pylint',
  families: ['python'],
  url: 'https://pylint.readthedocs.io/en/stable/user_guide/messages/message_control.html',
  match({ body, comment }) {
    const directive = /^pylint:\s*(disable-next|disable-msg|enable-msg|disable|enable)\s*=\s*([\w\-, ]+?)\s*(?:[;#]\s*(.*))?$/s.exec(body);
    if (directive) {
      if (directive[1].startsWith('enable')) return pragma('suppression-end');
      const scope = directive[1] === 'disable-next' ? 'next-line' : comment.ownLine ? 'region' : 'line';
      return suppression({ rules: splitRuleList(directive[2], /\s*,\s*/), scope, justification: directive[3], justificationSyntax: '; reason' });
    }
    if (/^pylint:\s*(?:skip-file|disable-all)\s*$/.test(body)) return suppression({ rules: [], scope: 'file' });
    return null;
  },
});

define({
  id: 'python-typing',
  tool: 'mypy / Pyright / PEP 484',
  toolKey: 'mypy',
  families: ['python'],
  url: 'https://mypy.readthedocs.io/en/stable/error_codes.html#silencing-errors-based-on-error-codes',
  match({ body }) {
    const ignore = /^type:\s*ignore(?:\[([\w\-, ]+)\])?(.*)$/s.exec(body);
    if (ignore) return suppression({ rules: splitRuleList(ignore[1], /\s*,\s*/), scope: 'line', trailing: ignore[2] });
    const pyrightIgnore = /^pyright:\s*ignore(?:\s*\[([\w, ]+)\])?(.*)$/s.exec(body);
    if (pyrightIgnore) return suppression({ rules: splitRuleList(pyrightIgnore[1], /\s*,\s*/), scope: 'line', trailing: pyrightIgnore[2] });
    const pyrightConfig = /^pyright:\s*((?:strict|basic|standard)\b.*|report\w+\s*=.*)$/s.exec(body);
    if (pyrightConfig) {
      const disabled = [...pyrightConfig[1].matchAll(/(report\w+)\s*=\s*(false|none)\b/g)].map(([, rule]) => rule);
      if (disabled.length > 0) return suppression({ rules: disabled, scope: 'file' });
      return pragma('config');
    }
    if (/^mypy:\s*ignore-errors\s*$/.test(body)) return suppression({ rules: [], scope: 'file' });
    if (/^mypy:\s*[\w-]+/.test(body)) return pragma('config');
    if (/^type:\s*(?!ignore\b)\S/.test(body)) return pragma('pragma', { detail: 'PEP 484 type comment' });
    return null;
  },
});

define({
  id: 'python-formatters',
  tool: 'Black / Ruff formatter / isort / YAPF',
  toolKey: 'formatter',
  families: ['python'],
  url: 'https://black.readthedocs.io/en/stable/usage_and_configuration/the_basics.html#ignoring-sections',
  match({ body }) {
    if (/^(?:ruff:\s*)?fmt:\s*(?:off|on|skip)\s*$/.test(body)) return pragma('formatting');
    if (/^yapf:\s*(?:disable|enable)\s*$/.test(body)) return pragma('formatting');
    if (/^(?:ruff:\s*)?isort:\s*(?:skip_file|skip|off|on|split|dont-add-imports(?::.*)?)\s*$/.test(body)) return pragma('formatting');
    return null;
  },
});

define({
  id: 'bandit',
  tool: 'Bandit',
  toolKey: 'bandit',
  families: ['python'],
  url: 'https://bandit.readthedocs.io/en/latest/config.html#exclusions',
  match({ body }) {
    const directive = /^nosec\b:?\s*(.*)$/s.exec(body);
    if (!directive) return null;
    const ids = [];
    const words = directive[1].split(/[\s,]+/).filter(Boolean);
    let index = 0;
    while (index < words.length && /^(?:B\d{3}|[a-z\d]+(?:_[a-z\d]+)+)$/i.test(words[index])) ids.push(words[index++]);
    return suppression({ rules: ids, scope: 'line', trailing: words.slice(index).join(' ') });
  },
});

define({
  id: 'coverage-py',
  tool: 'coverage.py',
  toolKey: 'coverage',
  families: ['python'],
  url: 'https://coverage.readthedocs.io/en/latest/excluding.html',
  match({ body }) {
    const directive = /^pragma:\s*no\s*(cover|branch)\b(.*)$/is.exec(body);
    if (!directive) return null;
    return suppression({ rules: ['coverage'], scope: 'statement', justification: directive[2].replace(/^[\s:-]+/, ''), justificationSyntax: 'trailing text' });
  },
});

define({
  id: 'intellij',
  tool: 'IntelliJ / PyCharm / Rider inspections',
  toolKey: 'intellij',
  families: ['python', ...JS, ...JVM, 'php'],
  url: 'https://www.jetbrains.com/help/idea/disabling-and-enabling-inspections.html',
  match({ body }) {
    const directive = /^@?noinspection\s+([\w, ]+)$/.exec(body);
    if (!directive) return null;
    return suppression({ rules: splitRuleList(directive[1], /\s*,\s*/), scope: 'statement' });
  },
});

define({
  id: 'go-lint',
  tool: 'golangci-lint / Staticcheck',
  toolKey: 'golangci-lint',
  families: ['go'],
  url: 'https://golangci-lint.run/docs/linters/false-positives/',
  match({ raw, comment }) {
    if (comment.marker !== '//') return null;
    const nolint = /^nolint(?::([\w-]+(?:,[\w-]+)*))?(?:\s*\/\/\s*(.*)|\s*)$/s.exec(raw);
    if (nolint) {
      return suppression({ rules: splitRuleList(nolint[1], /,/), scope: comment.ownLine ? 'statement' : 'line', justification: nolint[2], justificationSyntax: ' // explanation' });
    }
    const staticcheck = /^lint:(ignore|file-ignore)\s+([\w*,-]+)\s+(.+)$/s.exec(raw);
    if (staticcheck) {
      return suppression({
        rules: splitRuleList(staticcheck[2], /,/),
        scope: staticcheck[1] === 'file-ignore' ? 'file' : 'next-line',
        justification: staticcheck[3],
        justificationSyntax: 'mandatory reason',
      });
    }
    return null;
  },
});

const GO_COMPILER_DIRECTIVES = new Set([
  'build',
  'generate',
  'embed',
  'noinline',
  'nosplit',
  'noescape',
  'uintptrescapes',
  'norace',
  'linkname',
  'wasmimport',
  'wasmexport',
  'debug',
  'fix',
  'nocheckptr',
  'nointerface',
  'systemstack',
  'nowritebarrier',
  'nowritebarrierrec',
  'yeswritebarrierrec',
  'registerparams',
  'cgo_import_dynamic',
  'cgo_import_static',
  'cgo_export_dynamic',
  'cgo_export_static',
  'cgo_dynamic_linker',
  'cgo_ldflag',
  'cgo_unsafe_args',
]);

define({
  id: 'go-toolchain',
  tool: 'Go toolchain',
  toolKey: 'go',
  families: ['go'],
  url: 'https://pkg.go.dev/cmd/compile#hdr-Compiler_Directives',
  match({ raw, comment }) {
    if (comment.marker === '//') {
      const goDirective = /^go:([a-z_]+)\b/.exec(raw);
      if (goDirective && GO_COMPILER_DIRECTIVES.has(goDirective[1])) return pragma('pragma');
      if (/^ \+build\s+\S/.test(raw)) return pragma('pragma');
      if (/^line\s+\S*:\d+(?::\d+)?\s*$/.test(raw)) return pragma('pragma');
      if (/^(?:export|extern)\s+\w+/.test(raw)) return pragma('pragma');
    }
    if (comment.marker === '/*' && /^line\s+\S*:\d+(?::\d+)?$/.test(raw)) return pragma('pragma');
    return null;
  },
});

define({
  id: 'clang-tidy',
  tool: 'clang-tidy / cpplint',
  toolKey: 'clang-tidy',
  families: C_STYLE,
  url: 'https://clang.llvm.org/extra/clang-tidy/#suppressing-undesired-diagnostics',
  match({ body }) {
    const directive = /^NOLINT(NEXTLINE|BEGIN|END)?(?:\(([^)]*)\))?(.*)$/s.exec(body);
    if (!directive) return null;
    if (directive[1] === 'END') return pragma('suppression-end');
    const scope = directive[1] === 'NEXTLINE' ? 'next-line' : directive[1] === 'BEGIN' ? 'region' : 'line';
    return suppression({ rules: splitRuleList(directive[2], /\s*,\s*/), scope, justification: directive[3].replace(/^[\s:-]+/, ''), justificationSyntax: ': reason' });
  },
});

define({
  id: 'c-tools',
  tool: 'clang-format / cppcheck / IWYU / LCOV / gcovr',
  toolKey: 'c-tools',
  families: C_STYLE,
  url: 'https://clang.llvm.org/docs/ClangFormatStyleOptions.html#disabling-formatting-on-a-piece-of-code',
  match({ body }) {
    if (/^clang-format\s+(?:off|on)(?::.*)?$/s.test(body)) return pragma('formatting');
    const cppcheck = /^cppcheck-suppress(-begin|-end|-file|-macro)?(?:\s+([\w-]+)|\[([\w,\s-]+)\])(.*)$/s.exec(body);
    if (cppcheck) {
      if (cppcheck[1] === '-end') return pragma('suppression-end');
      const scope = cppcheck[1] === '-file' ? 'file' : cppcheck[1] === '-begin' ? 'region' : 'line';
      return suppression({
        rules: splitRuleList(cppcheck[2] ?? cppcheck[3], /\s*,\s*/),
        scope,
        justification: cppcheck[4].replace(/^[\s;/]+/, ''),
        justificationSyntax: 'trailing text',
      });
    }
    if (/^IWYU pragma:\s*(?:keep|export|begin_exports|end_exports|begin_keep|end_keep|private|friend|no_include|no_forward_declare|associated|always_keep)\b/.test(body)) {
      return pragma('pragma');
    }
    const coverage = /^(?:LCOV|GCOVR|GCOV)_EXCL_(\w+)\b(.*)$/s.exec(body);
    if (coverage) {
      if (/STOP$/.test(coverage[1])) return pragma('suppression-end');
      return suppression({
        rules: ['coverage'],
        scope: /START$/.test(coverage[1]) ? 'region' : 'line',
        justification: coverage[2].replace(/^[\s:-]+/, ''),
        justificationSyntax: 'trailing text',
      });
    }
    return null;
  },
});

define({
  id: 'resharper',
  tool: 'ReSharper / Rider',
  toolKey: 'resharper',
  families: ['csharp'],
  url: 'https://www.jetbrains.com/help/resharper/Code_Analysis__Configuring_Warnings.html',
  match({ body }) {
    const directive = /^ReSharper\s+(disable|restore)(\s+once)?\s+([\w.,\s]+)$/.exec(body);
    if (!directive) return null;
    if (directive[1] === 'restore') return pragma('suppression-end');
    return suppression({ rules: splitRuleList(directive[3], /\s*,\s*/), scope: directive[2] ? 'next-line' : 'region' });
  },
});

define({
  id: 'sonar',
  tool: 'SonarQube / SonarLint',
  toolKey: 'sonar',
  families: null,
  url: 'https://docs.sonarsource.com/sonarqube-server/latest/user-guide/issues/introduction/',
  match({ body }) {
    const directive = /^NOSONAR\b(.*)$/s.exec(body);
    if (!directive) return null;
    return suppression({ rules: [], scope: 'line', justification: directive[1].replace(/^[\s:-]+/, ''), justificationSyntax: 'trailing text' });
  },
});

define({
  id: 'pmd',
  tool: 'PMD',
  toolKey: 'pmd',
  families: [...JVM],
  url: 'https://docs.pmd-code.org/latest/pmd_userdocs_suppressing_warnings.html#nopmd-comment',
  match({ body }) {
    const directive = /^NOPMD\b(.*)$/s.exec(body);
    if (!directive) return null;
    return suppression({ rules: [], scope: 'line', justification: directive[1].replace(/^[\s:-]+/, ''), justificationSyntax: 'trailing message' });
  },
});

define({
  id: 'checkstyle',
  tool: 'Checkstyle (SuppressionCommentFilter / SuppressWithNearbyCommentFilter)',
  toolKey: 'checkstyle',
  families: [...JVM],
  activation: 'Only effective when the corresponding Checkstyle filter is configured.',
  url: 'https://checkstyle.sourceforge.io/filters/suppressioncommentfilter.html',
  match({ body }) {
    const toggle = /^CHECKSTYLE:(OFF|ON)(?::?\s*([\w, ]+))?$/.exec(body);
    if (toggle) {
      if (toggle[1] === 'ON') return pragma('suppression-end');
      return suppression({ rules: splitRuleList(toggle[2], /\s*,\s*/), scope: 'region' });
    }
    const nearby = /^SUPPRESS CHECKSTYLE (\w+)(.*)$/s.exec(body);
    if (nearby) return suppression({ rules: [nearby[1]], scope: 'line', justification: nearby[2], justificationSyntax: 'trailing text' });
    return null;
  },
});

define({
  id: 'formatter-markers',
  tool: 'IntelliJ / Eclipse formatter markers',
  toolKey: 'formatter',
  families: [...JVM, ...JS, 'csharp', 'php', 'python', 'go', 'rust', ...C_STYLE, 'swift', 'dart'],
  activation: 'IntelliJ honours these only when formatter markers are enabled in Code Style settings.',
  url: 'https://www.jetbrains.com/help/idea/reformat-and-rearrange-code.html',
  match({ body }) {
    if (/^@formatter:(?:off|on)$/.test(body)) return pragma('formatting');
    return null;
  },
});

define({
  id: 'swift-tools',
  tool: 'SwiftLint / SwiftFormat',
  toolKey: 'swiftlint',
  families: ['swift'],
  url: 'https://realm.github.io/SwiftLint/index.html#disable-rules-in-code',
  match({ body }) {
    const swiftlint = /^swiftlint:(disable|enable)(?::(next|this|previous))?\s+(.+)$/s.exec(body);
    if (swiftlint) {
      if (swiftlint[1] === 'enable') return pragma('suppression-end');
      const scope = swiftlint[2] ? (swiftlint[2] === 'next' ? 'next-line' : 'line') : 'region';
      return suppression({ rules: splitRuleList(swiftlint[3], /\s+/), scope });
    }
    const swiftformat = /^swiftformat:(disable|enable|options)(?::(next|this|previous|all))?\s*(.*)$/s.exec(body);
    if (swiftformat) return pragma('formatting');
    return null;
  },
});

define({
  id: 'dart-analyzer',
  tool: 'Dart analyzer / dart format',
  toolKey: 'dart',
  families: ['dart', 'yaml'],
  url: 'https://dart.dev/tools/analysis#suppressing-diagnostics-for-a-file',
  match({ body }) {
    const ignore = /^(ignore|ignore_for_file):\s*([\w=, ]+)$/.exec(body);
    if (ignore) return suppression({ rules: splitRuleList(ignore[2], /\s*,\s*/), scope: ignore[1] === 'ignore' ? 'next-line' : 'file' });
    if (/^dart format (?:off|on|width=\d+)$/.test(body)) return pragma('formatting');
    return null;
  },
});

define({
  id: 'rubocop',
  tool: 'RuboCop / Standard Ruby',
  toolKey: 'rubocop',
  families: ['ruby'],
  url: 'https://docs.rubocop.org/rubocop/configuration.html#disabling-cops-within-source-code',
  match({ body, comment }) {
    const rubocop = /^rubocop:(disable-next|todo-next|enable-next|disable|enable|todo|push|pop|next)\b(.*)$/s.exec(body);
    if (rubocop) {
      const [, mode, rest] = rubocop;
      if (mode === 'enable' || mode === 'pop' || mode === 'enable-next') return pragma('suppression-end');
      const { head, description } = splitDoubleDashDescription(rest);
      const scope = mode.endsWith('-next') || mode === 'next' ? 'next-line' : comment.ownLine ? 'region' : 'line';
      return suppression({ rules: splitRuleList(head.replace(/[+-](?=\w)/g, ''), /\s*,\s*|\s+/), scope, justification: description, justificationSyntax: ' -- ' });
    }
    const standard = /^standard:(disable|enable)\s+(.+)$/s.exec(body);
    if (standard) {
      if (standard[1] === 'enable') return pragma('suppression-end');
      return suppression({ rules: splitRuleList(standard[2], /\s*,\s*/), scope: comment.ownLine ? 'region' : 'line' });
    }
    return null;
  },
});

define({
  id: 'ruby-typing',
  tool: 'Sorbet / Steep / RBS / Reek / RDoc',
  toolKey: 'ruby-types',
  families: ['ruby'],
  url: 'https://github.com/ruby/rbs/blob/master/docs/inline.md',
  match({ body, raw }) {
    if (/^typed:\s*(?:ignore|false|true|strict|strong)\s*$/.test(body)) return pragma('pragma');
    const steep = /^steep:ignore(:start|:end)?\b\s*(.*)$/s.exec(body);
    if (steep) {
      if (steep[1] === ':end') return pragma('suppression-end');
      return suppression({ rules: splitRuleList(steep[2]), scope: steep[1] === ':start' ? 'region' : 'line' });
    }
    if (/^@type\s+(?:var|self|ivar|gvar|const|instance|module|method|break)\b/.test(body)) return pragma('pragma');
    if (/^:\s/.test(raw) || /^@rbs\b/.test(body)) return pragma('pragma');
    const reek = /^(:reek:\w+(?:\s*\{[^}]*\})?(?:\s+and\s+:reek:\w+)*)\s*$/.exec(body);
    if (reek) return suppression({ rules: [...reek[1].matchAll(/:reek:(\w+)/g)].map(([, smell]) => smell), scope: 'statement' });
    if (/^:(?:nodoc|stopdoc|startdoc|enddoc):(?:\s+all)?$/.test(body)) return pragma('pragma');
    return null;
  },
});

define({
  id: 'php-tools',
  tool: 'PHPStan / Psalm / PHP_CodeSniffer / PHPMD',
  toolKey: 'php',
  families: ['php'],
  url: 'https://phpstan.org/user-guide/ignoring-errors',
  match({ body }) {
    const phpstan = /^@phpstan-ignore(-line|-next-line)?(?:\s+([\w.,\s]+?))?\s*(?:\((.*)\))?$/s.exec(body);
    if (phpstan) {
      const scope = phpstan[1] === '-line' ? 'line' : 'next-line';
      return suppression({ rules: splitRuleList(phpstan[2], /\s*,\s*/), scope, justification: phpstan[3], justificationSyntax: '(reason)' });
    }
    const psalm = /^@psalm-suppress\s+([\w, ]+)$/.exec(body);
    if (psalm) return suppression({ rules: splitRuleList(psalm[1], /\s*,\s*/), scope: 'statement' });
    const phpcs = /^phpcs:(ignoreFile|ignore|disable|enable)\b(.*)$/s.exec(body);
    if (phpcs) {
      if (phpcs[1] === 'enable') return pragma('suppression-end');
      const { head, description } = splitDoubleDashDescription(phpcs[2]);
      const scope = { ignoreFile: 'file', ignore: 'line', disable: 'region' }[phpcs[1]];
      return suppression({ rules: splitRuleList(head, /\s*,\s*/), scope, justification: description, justificationSyntax: ' -- ' });
    }
    const phpmd = /^@SuppressWarnings\((?:"?)(PHPMD(?:\.\w+)?|[\w]+)(?:"?)\)$/.exec(body);
    if (phpmd) return suppression({ rules: phpmd[1] === 'PHPMD' ? [] : [phpmd[1]], scope: 'statement' });
    return null;
  },
});

define({
  id: 'shellcheck',
  tool: 'ShellCheck',
  toolKey: 'shellcheck',
  families: ['shell', 'yaml'],
  url: 'https://github.com/koalaman/shellcheck/wiki/Directive',
  match({ body }) {
    const directive = /^shellcheck\s+((?:(?:disable|enable|source|source-path|shell|external-sources)=\S+\s*)+)$/.exec(body);
    if (!directive) return null;
    const disabled = [...directive[1].matchAll(/disable=(\S+)/g)].flatMap(([, list]) => splitRuleList(list, /,/));
    if (disabled.length > 0) return suppression({ rules: disabled, scope: 'statement', justificationSyntax: 'separate # comment' });
    return pragma('config');
  },
});

define({
  id: 'sql-tools',
  tool: 'SQLFluff / MySQL / Oracle / migration tools',
  toolKey: 'sqlfluff',
  families: ['sql'],
  url: 'https://docs.sqlfluff.com/en/stable/configuration/ignoring_configuration.html',
  match({ body, raw, comment }) {
    const noqa = /^noqa(?::\s*(?:(disable|enable)=)?([\w,\s]+))?$/.exec(body);
    if (noqa) {
      if (noqa[1] === 'enable') return pragma('suppression-end');
      return suppression({ rules: splitRuleList(noqa[2], /\s*,\s*/), scope: noqa[1] === 'disable' ? 'region' : 'line' });
    }
    if (comment.marker === '/*' && (/^!\d{0,6}\s/.test(raw) || /^\+/.test(raw))) return pragma('pragma');
    if (comment.marker === '--' && /^\+\s*\w/.test(raw)) return pragma('pragma');
    if (/^\+goose\s+(?:Up|Down|StatementBegin|StatementEnd|NO TRANSACTION|ENVSUB (?:ON|OFF))\s*$/.test(body)) return pragma('pragma');
    if (/^migrate:(?:up|down)(?:\s+\w+:\w+)*\s*$/.test(body)) return pragma('pragma');
    if (/^name:\s+\w+\s+:(?:one|many|exec|execresult|execrows|execlastid|batchexec|batchmany|batchone|copyfrom)\s*$/.test(body)) return pragma('pragma');
    if (
      comment.marker === '--' &&
      /^(?:liquibase formatted sql|changeset\s+\S+:\S+.*|rollback\b.*|comment:.*|preconditions\b.*|precondition-[\w-]+\b.*|validCheckSum:.*|ignoreLines:.*)$/.test(raw)
    ) {
      return pragma('pragma');
    }
    return null;
  },
});

define({
  id: 'iac-scanners',
  tool: 'TFLint / tfsec / Trivy / Checkov',
  toolKey: 'iac',
  families: ['hcl', 'yaml', 'dockerfile', 'toml'],
  url: 'https://github.com/terraform-linters/tflint/blob/master/docs/user-guide/annotations.md',
  match({ body }) {
    const tflint = /^tflint-ignore(-file)?:\s*([\w, ]+?)(?:\s+#\s*(.*))?$/s.exec(body);
    if (tflint)
      return suppression({ rules: splitRuleList(tflint[2], /\s*,\s*/), scope: tflint[1] ? 'file' : 'next-line', justification: tflint[3], justificationSyntax: ' # reason' });
    const tfsec = /^((?:(?:tfsec|trivy):ignore:[\w*-]+(?::exp:\d{4}-\d{2}-\d{2}|:ws:\S+|\[[^\]]*\])*\s*)+)$/.exec(body);
    if (tfsec) return suppression({ rules: [...tfsec[1].matchAll(/(?:tfsec|trivy):ignore:([\w*-]+)/g)].map(([, id]) => id), scope: 'statement' });
    const checkov = /^checkov:skip=([\w]+)(?::(.*))?$/s.exec(body);
    if (checkov) return suppression({ rules: [checkov[1]], scope: 'statement', justification: checkov[2], justificationSyntax: ':reason' });
    return null;
  },
});

define({
  id: 'yaml-tools',
  tool: 'yamllint / ansible-lint / yaml-language-server / Renovate',
  toolKey: 'yamllint',
  families: ['yaml'],
  url: 'https://yamllint.readthedocs.io/en/stable/disable_with_comments.html',
  match({ body }) {
    const yamllint = /^yamllint\s+(disable-line|disable-file|disable|enable)\b\s*(.*)$/s.exec(body);
    if (yamllint) {
      if (yamllint[1] === 'enable') return pragma('suppression-end');
      const rules = [...yamllint[2].matchAll(/rule:([\w-]+)/g)].map(([, rule]) => rule);
      const scope = { 'disable-line': 'line', 'disable-file': 'file', disable: 'region' }[yamllint[1]];
      return suppression({ rules, scope });
    }
    const ansible = /^noqa(?::?\s+([\w[\]-]+(?:\s+[\w[\]-]+)*))?\s*$/.exec(body);
    if (ansible) return suppression({ rules: splitRuleList(ansible[1]), scope: 'line' });
    if (/^(?:yaml-language-server:\s*)?\$schema[:=]\s*\S+$/.test(body)) return pragma('metadata');
    if (/^renovate:\s+\w+=\S+/.test(body)) return pragma('metadata', { detail: 'Renovate custom manager annotation (syntax defined by the project regex)' });
    return null;
  },
});

define({
  id: 'dockerfile',
  tool: 'Docker BuildKit / Hadolint',
  toolKey: 'hadolint',
  families: ['dockerfile'],
  url: 'https://docs.docker.com/reference/dockerfile/#parser-directives',
  match({ body, context }) {
    if (context.inDockerDirectiveBlock && /^(?:syntax|escape|check)\s*=\s*\S+$/i.test(body)) return pragma('pragma');
    const hadolint = /^hadolint\s+(global\s+)?ignore=([\w,]+)(?:\s+#\s*(.*))?$/s.exec(body);
    if (hadolint)
      return suppression({ rules: splitRuleList(hadolint[2], /,/), scope: hadolint[1] ? 'file' : 'next-line', justification: hadolint[3], justificationSyntax: ' # reason' });
    if (/^hadolint\s+shell=\S+$/.test(body)) return pragma('config');
    return null;
  },
});

define({
  id: 'lua-tools',
  tool: 'Luacheck / LuaLS',
  toolKey: 'luacheck',
  families: ['lua'],
  url: 'https://luacheck.readthedocs.io/en/stable/inline.html',
  match({ body, raw }) {
    const luacheck = /^luacheck:\s*(.+)$/s.exec(body);
    if (luacheck) {
      if (/^\s*(?:push|pop)\s*$/.test(luacheck[1])) return pragma('config');
      if (/\bignore\b/.test(luacheck[1])) return suppression({ rules: splitRuleList(luacheck[1].replace(/\bignore\b/, '')), scope: 'line' });
      return pragma('config');
    }
    const diagnostic = /^-@diagnostic\s+(disable-next-line|disable-line|disable|enable)(?::\s*([\w, -]+))?$/.exec(raw);
    if (diagnostic) {
      if (diagnostic[1] === 'enable') return pragma('suppression-end');
      const scope = { 'disable-next-line': 'next-line', 'disable-line': 'line', disable: 'file' }[diagnostic[1]];
      return suppression({ rules: splitRuleList(diagnostic[2], /\s*,\s*/), scope });
    }
    if (/^-@\w+/.test(raw)) return pragma('pragma', { detail: 'LuaCATS annotation' });
    return null;
  },
});

define({
  id: 'credo',
  tool: 'Credo',
  toolKey: 'credo',
  families: ['elixir'],
  url: 'https://credo.hexdocs.pm/config_comments.html',
  match({ body }) {
    const directive = /^credo:disable-for-(this-file|next-line|previous-line|lines:-?\d+)\b\s*(.*)$/s.exec(body);
    if (!directive) return null;
    return suppression({ rules: splitRuleList(directive[2]), scope: directive[1] === 'this-file' ? 'file' : 'line' });
  },
});

define({
  id: 'lintr',
  tool: 'lintr',
  toolKey: 'lintr',
  families: ['r'],
  url: 'https://lintr.r-lib.org/articles/lintr.html#exclusions',
  match({ body }) {
    const directive = /^nolint(?:\s+(start|end))?(?::\s*([\w, ]+)\.)?(.*)$/s.exec(body);
    if (!directive) return null;
    if (directive[1] === 'end') return pragma('suppression-end');
    return suppression({
      rules: splitRuleList(directive[2], /\s*,\s*/),
      scope: directive[1] === 'start' ? 'region' : 'line',
      justification: directive[3],
      justificationSyntax: 'text after the terminating period',
    });
  },
});

define({
  id: 'universal-metadata',
  tool: 'SPDX / REUSE / editors / code generators',
  toolKey: 'metadata',
  families: null,
  url: 'https://spdx.github.io/spdx-spec/v2.3.1/using-SPDX-short-identifiers-in-source-files/',
  match({ body }) {
    if (/^SPDX-(?:License-Identifier|FileCopyrightText|FileContributor|SnippetBegin|SnippetEnd|SnippetCopyrightText|SnippetLicenseConcluded)\s*:?/.test(body))
      return pragma('metadata');
    if (/^REUSE-Ignore(?:Start|End)$/.test(body)) return pragma('metadata');
    if (/^-\*-.*-\*-$/.test(body)) return pragma('metadata');
    if (/^(?:vim?|ex|Vim):\s*(?:set?\s+)?[\w=:\s-]+:?$/.test(body) || /\svim?:\s*set?\s+[\w=\s]+:/.test(` ${body}`)) return pragma('metadata');
    if (/^Code generated .* DO NOT EDIT\.$/.test(body) || /^@generated\b/.test(body) || /^<auto-generated\b/.test(body))
      return pragma('metadata', { detail: 'generated-code marker' });
    return null;
  },
});

export const DIRECTIVE_DEFINITIONS = DEFINITIONS;

export function definitionsFor(family) {
  return DEFINITIONS.filter((definition) => definition.families === null || definition.families.includes(family));
}

export const NEAR_MISS_KEYWORDS = [
  ['eslint', /^eslint[-\s]?(?:disable|enable)/i],
  ['typescript', /^@?\s*ts[-\s]?(?:ignore|expect[-\s]?error|nocheck)/i],
  ['ruff', /^no\s*qa\b/i],
  ['pylint', /^pylint\s*:?/i],
  ['mypy', /^type\s*:\s*ignore/i],
  ['golangci-lint', /^\s*nolint\b/i],
  ['clang-tidy', /^nolint/i],
  ['rubocop', /^rubocop\s*:?\s*(?:disable|enable|todo)/i],
  ['shellcheck', /^shellcheck\b/i],
  ['biome', /^biome[-\s]?ignore/i],
  ['prettier', /^prettier[-\s]?ignore/i],
  ['phpcs', /^phpcs\s*:?/i],
  ['swiftlint', /^swiftlint\s*:?/i],
  ['go', /^\s+go:[a-z]+/],
];
