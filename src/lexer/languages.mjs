import * as profiles from './profiles.mjs';

export const SUPPORT_TIERS = {
  1: 'Full: lexer, directive registry, documentation policy, and dedicated tests',
  2: 'Standard: lexer and directive registry with representative tests',
  3: 'Basic: lexer and core directives only',
};

const LANGUAGES = [
  { id: 'typescript', tier: 1, extensions: ['.ts', '.mts', '.cts'], profile: () => profiles.javascriptProfile() },
  { id: 'tsx', family: 'typescript', tier: 1, extensions: ['.tsx'], profile: () => profiles.javascriptProfile({ jsx: true }) },
  { id: 'javascript', tier: 1, extensions: ['.js', '.mjs', '.cjs'], profile: () => profiles.javascriptProfile({ jsx: true }) },
  { id: 'jsx', family: 'javascript', tier: 1, extensions: ['.jsx'], profile: () => profiles.javascriptProfile({ jsx: true }) },
  { id: 'python', tier: 1, extensions: ['.py', '.pyi', '.pyw'], profile: () => profiles.pythonProfile() },
  { id: 'go', tier: 1, extensions: ['.go'], profile: () => profiles.goProfile() },
  { id: 'rust', tier: 1, extensions: ['.rs'], profile: () => profiles.rustProfile() },
  { id: 'java', tier: 1, extensions: ['.java'], profile: () => profiles.javaProfile() },
  { id: 'csharp', tier: 1, extensions: ['.cs'], profile: () => profiles.csharpProfile() },
  { id: 'c', tier: 1, extensions: ['.c', '.h'], profile: () => profiles.cFamilyProfile({ cpp: false }) },
  {
    id: 'cpp',
    tier: 1,
    extensions: ['.cc', '.cpp', '.cxx', '.c++', '.hh', '.hpp', '.hxx', '.ipp', '.inl'],
    profile: () => profiles.cFamilyProfile({ cpp: true }),
  },
  { id: 'kotlin', tier: 2, extensions: ['.kt', '.kts'], profile: () => profiles.javaProfile({ kotlin: true }) },
  { id: 'swift', tier: 2, extensions: ['.swift'], profile: () => profiles.swiftProfile() },
  { id: 'dart', tier: 2, extensions: ['.dart'], profile: () => profiles.dartProfile() },
  {
    id: 'ruby',
    tier: 2,
    extensions: ['.rb', '.rake', '.gemspec', '.ru'],
    filenames: ['Gemfile', 'Rakefile', 'Guardfile', 'Capfile', 'Brewfile'],
    profile: () => profiles.rubyProfile(),
  },
  { id: 'php', tier: 2, extensions: ['.php', '.phtml'], profile: () => profiles.phpProfile() },
  {
    id: 'shell',
    tier: 2,
    extensions: ['.sh', '.bash', '.zsh', '.ksh', '.bats'],
    filenames: ['.bashrc', '.bash_profile', '.zshrc', '.profile'],
    profile: () => profiles.shellProfile(),
  },
  { id: 'sql', tier: 2, extensions: ['.sql'], profile: () => profiles.sqlProfile() },
  { id: 'css', tier: 2, extensions: ['.css'], profile: () => profiles.cssProfile() },
  { id: 'scss', family: 'css', tier: 2, extensions: ['.scss', '.less'], profile: () => profiles.cssProfile({ lineComments: true }) },
  { id: 'html', tier: 2, extensions: ['.html', '.htm', '.xhtml'], markup: { scripts: true } },
  { id: 'vue', tier: 2, extensions: ['.vue'], markup: { scripts: true } },
  { id: 'svelte', tier: 2, extensions: ['.svelte'], markup: { scripts: true } },
  { id: 'xml', tier: 2, extensions: ['.xml', '.svg', '.xsd', '.xsl', '.csproj', '.props', '.targets'], markup: { scripts: false } },
  { id: 'yaml', tier: 2, extensions: ['.yml', '.yaml'], profile: () => profiles.yamlProfile() },
  { id: 'toml', tier: 2, extensions: ['.toml'], profile: () => profiles.tomlProfile() },
  { id: 'hcl', tier: 2, extensions: ['.tf', '.tfvars', '.hcl'], profile: () => profiles.hclProfile() },
  {
    id: 'dockerfile',
    tier: 2,
    extensions: ['.dockerfile'],
    filenames: ['Dockerfile', 'Containerfile'],
    filenamePattern: /^(?:Dockerfile|Containerfile)(?:\.[\w.-]+)?$/,
    profile: () => profiles.dockerfileProfile(),
  },
  { id: 'lua', tier: 3, extensions: ['.lua'], profile: () => profiles.luaProfile() },
  { id: 'elixir', tier: 3, extensions: ['.ex', '.exs'], profile: () => profiles.elixirProfile() },
  { id: 'r', tier: 3, extensions: ['.r', '.R'], profile: () => profiles.rProfile() },
];

const BY_ID = new Map(LANGUAGES.map((language) => [language.id, language]));

export function languageById(id) {
  return BY_ID.get(id) ?? null;
}

export function familyOf(language) {
  return language.family ?? language.id;
}

export function allLanguages() {
  return LANGUAGES;
}

function basename(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function extensionOf(name) {
  const dot = name.lastIndexOf('.');
  return dot <= 0 ? '' : name.slice(dot);
}

export function detectLanguage(filePath) {
  const name = basename(filePath);
  for (const language of LANGUAGES) {
    if (language.filenames?.includes(name)) return language;
    if (language.filenamePattern?.test(name)) return language;
  }
  const extension = extensionOf(name);
  if (!extension) return null;
  return LANGUAGES.find((language) => language.extensions.includes(extension)) ?? LANGUAGES.find((language) => language.extensions.includes(extension.toLowerCase())) ?? null;
}

const SHEBANG_INTERPRETERS = [
  [/\b(?:python[\d.]*|pypy[\d.]*)\b/, 'python'],
  [/\b(?:node|deno|bun)\b/, 'javascript'],
  [/\b(?:bash|sh|zsh|ksh|dash)\b/, 'shell'],
  [/\bruby\b/, 'ruby'],
  [/\bphp\b/, 'php'],
  [/\b(?:lua|luajit)\b/, 'lua'],
  [/\bRscript\b/, 'r'],
  [/\belixir\b/, 'elixir'],
];

export function detectLanguageFromShebang(content) {
  if (!content.startsWith('#!')) return null;
  const firstLine = content.slice(0, content.indexOf('\n') === -1 ? undefined : content.indexOf('\n'));
  for (const [pattern, id] of SHEBANG_INTERPRETERS) if (pattern.test(firstLine)) return languageById(id);
  return null;
}
