import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLanguage, detectLanguageFromShebang } from '../../src/lexer/languages.mjs';
import { lexSource } from '../../src/lexer/lex.mjs';

function commentTexts(languageId, source) {
  const result = lexSource(source, languageId);
  assert.equal(result.ok, true, `expected ${languageId} to lex: ${result.reason}`);
  return result.comments.map((comment) => comment.text);
}

const CASES = [
  {
    name: 'JavaScript: comment-like text in strings and URLs',
    language: 'javascript',
    source: 'const url = "http://example.com/a//b"; // real\nconst s = \'/* not */\';\n',
    expected: ['// real'],
  },
  {
    name: 'JavaScript: regular expression literal containing slashes',
    language: 'javascript',
    source: 'const re = /\\/\\/[^/]*/g; // after regex\nconst ratio = a / b / c; // division\n',
    expected: ['// after regex', '// division'],
  },
  {
    name: 'JavaScript: regex character class containing a slash',
    language: 'javascript',
    source: 'const re = /[/]+/; // ok\n',
    expected: ['// ok'],
  },
  {
    name: 'JavaScript: template literal with nested comment inside interpolation',
    language: 'javascript',
    source: 'const t = `// not ${value /* real */} also // not`;\n',
    expected: ['/* real */'],
  },
  {
    name: 'JavaScript: nested template literal',
    language: 'javascript',
    source: 'const t = `a ${`b ${c} // no`} // no`; // yes\n',
    expected: ['// yes'],
  },
  {
    name: 'TSX: JSX text containing // is not a comment',
    language: 'tsx',
    source: 'const a = <a href="http://x">http://example.com // text</a>; // yes\nconst b = <div>{/* jsx comment */}</div>;\n',
    expected: ['// yes', '/* jsx comment */'],
  },
  {
    name: 'TSX: generic arrow function is not JSX',
    language: 'tsx',
    source: 'const id = <T,>(value: T) => value; // generic\n',
    expected: ['// generic'],
  },
  {
    name: 'TypeScript: comparison is not JSX and not a regex',
    language: 'typescript',
    source: 'if (a < b && c > d) { x = y / 2; } // compare\n',
    expected: ['// compare'],
  },
  {
    name: 'Python: hash inside strings and f-strings with nested quotes',
    language: 'python',
    source: 'a = "# no"\nb = f"{d["k"]} # no"  # yes\nc = r"\\"#" # raw\n',
    expected: ['# yes', '# raw'],
  },
  {
    name: 'Python: triple-quoted strings span lines',
    language: 'python',
    source: 'x = """\n# not a comment\n"""\n# real\n',
    expected: ['# real'],
  },
  {
    name: 'Go: raw string literal',
    language: 'go',
    source: "var s = `// not\n/* not */` // yes\nr := '/' // rune\n",
    expected: ['// yes', '// rune'],
  },
  {
    name: 'Rust: nested block comments, raw strings, lifetimes and chars',
    language: 'rust',
    source: 'fn f<\'a>(s: &\'a str) -> char { \'"\' } /* outer /* inner */ still */\nlet r = r##"// "# no"##; // yes\n',
    expected: ['/* outer /* inner */ still */', '// yes'],
  },
  {
    name: 'C++: digit separators and raw strings',
    language: 'cpp',
    source: 'int n = 1\'000\'000; // big\nauto r = R"sql(-- // not)sql"; // raw\n#include <path//odd.h>\n',
    expected: ['// big', '// raw'],
  },
  {
    name: 'C: line comment continued with a backslash',
    language: 'c',
    source: 'int x; // continued \\\nstill comment\nint y;\n',
    expected: ['// continued \\\nstill comment'],
  },
  {
    name: 'C#: verbatim, interpolated and raw strings',
    language: 'csharp',
    source: 'var a = @"C:\\ "" // no"; var b = $"{x} // no {{"; var c = """\n// no\n"""; // yes\n',
    expected: ['// yes'],
  },
  {
    name: 'Java: text block',
    language: 'java',
    source: 'String s = """\n  // not\n  """; // yes\n',
    expected: ['// yes'],
  },
  {
    name: 'Kotlin: nested block comments and templates',
    language: 'kotlin',
    source: 'val s = "${map["k"]} // no" /* a /* b */ c */\n',
    expected: ['/* a /* b */ c */'],
  },
  {
    name: 'Swift: interpolation with nested string and extended delimiters',
    language: 'swift',
    source: 'let a = "\\(dict["k"]) // no" // yes\nlet b = #"raw // no"# /* c */\n',
    expected: ['// yes', '/* c */'],
  },
  {
    name: 'Ruby: interpolation, heredoc, and =begin',
    language: 'ruby',
    source: 'x = "#{y} # no" # yes\nputs <<~EOS\n  # not a comment\nEOS\n=begin\nblock\n=end\nz = %w[a#b] # pct\n',
    expected: ['# yes', '=begin\nblock\n=end', '# pct'],
  },
  {
    name: 'Shell: hash in parameter expansion, quotes, and heredoc',
    language: 'shell',
    source: 'echo $# ${#arr} "a # b" \'c # d\' # yes\ncat <<EOF\n# no\nEOF\nx=a#b # after\n',
    expected: ['# yes', '# after'],
  },
  {
    name: 'YAML: quotes, apostrophes in plain scalars, and block scalars',
    language: 'yaml',
    source: 'a: "x # y" # yes\nb: it\'s # c\nc: |\n  # not a comment\nd: 1\n',
    expected: ['# yes', '# c'],
  },
  {
    name: 'SQL: quoted text and dollar quoting',
    language: 'sql',
    source: 'SELECT \'-- no\', "--" -- yes\nCREATE FUNCTION f() AS $body$ -- no $body$; /* b */\n',
    expected: ['-- yes', '/* b */'],
  },
  {
    name: 'Vue: template comments and embedded TypeScript and SCSS',
    language: 'vue',
    source: '<template><p>// no</p><!-- yes --></template>\n<script setup lang="ts">\n// ts\n</script>\n<style lang="scss">\n// scss\n</style>\n',
    expected: ['<!-- yes -->', '// ts', '// scss'],
  },
  {
    name: 'HTML: comment markers inside attribute values',
    language: 'html',
    source: '<a title="<!-- no -->">x</a><!-- yes --><script>/* js */</script>\n',
    expected: ['<!-- yes -->', '/* js */'],
  },
  {
    name: 'PHP: attributes are not hash comments and ?> ends a line comment',
    language: 'php',
    source: '<p><!-- html --></p><?php #[Attr] $a = 1; # hash\n// line ?><?php /* block */\n',
    expected: ['# hash', '// line ', '/* block */'],
  },
  {
    name: 'Lua: long brackets',
    language: 'lua',
    source: 'local s = [[-- no]] -- yes\n--[==[ block ]==]\n',
    expected: ['-- yes', '--[==[ block ]==]'],
  },
  {
    name: 'HCL: interpolation and heredoc',
    language: 'hcl',
    source: 'name = "${var.x} # no" # yes\npolicy = <<EOF\n# no\nEOF\n// slash\n',
    expected: ['# yes', '// slash'],
  },
  {
    name: 'Dockerfile: only line-leading hashes are comments',
    language: 'dockerfile',
    source: '# syntax=docker/dockerfile:1\nRUN echo "a" # not a comment\n# real\n',
    expected: ['# syntax=docker/dockerfile:1', '# real'],
  },
  {
    name: 'Unicode identifiers and text',
    language: 'javascript',
    source: 'const café = "naïve // no"; // ünïcödé comment ✓\n',
    expected: ['// ünïcödé comment ✓'],
  },
  {
    name: 'CRLF line endings',
    language: 'typescript',
    source: 'const a = 1; // first\r\nconst b = 2; // second\r\n',
    expected: ['// first', '// second'],
  },
];

for (const { name, language, source, expected } of CASES) {
  test(name, () => {
    assert.deepEqual(commentTexts(language, source), expected);
  });
}

test('comment positions report line, column, and ownership of the line', () => {
  const result = lexSource('const a = 1;\n  // own line\nconst b = 2; // trailing\n', 'javascript');
  const [own, trailing] = result.comments;
  assert.equal(own.line, 2);
  assert.equal(own.column, 3);
  assert.equal(own.ownLine, true);
  assert.equal(trailing.ownLine, false);
});

test('block comment bodies drop decoration', () => {
  const [comment] = lexSource('/**\n * Hello\n * world\n */\nfunction f() {}\n', 'javascript').comments;
  assert.equal(comment.body, 'Hello\nworld');
});

test('unterminated constructs are reported as unreliable instead of guessed', () => {
  for (const [language, source] of [
    ['javascript', 'const s = `unterminated'],
    ['javascript', '/* never closed'],
    ['python', 'x = """open'],
    ['rust', 'let s = r#"open'],
    ['ruby', 'puts <<~EOS\nno terminator\n'],
    ['sql', '/* outer /* nested */ ambiguous */'],
  ]) {
    const result = lexSource(source, language);
    assert.equal(result.ok, false, `${language} should be unreliable for ${JSON.stringify(source)}`);
  }
});

test('unsupported script languages inside markup are unreliable', () => {
  assert.equal(lexSource('<template lang="pug">p hi</template>', 'vue').ok, false);
  assert.equal(lexSource('<script lang="coffee">x = 1</script>', 'vue').ok, false);
});

test('language detection by extension, filename, and shebang', () => {
  assert.equal(detectLanguage('/a/b.tsx').id, 'tsx');
  assert.equal(detectLanguage('/a/Dockerfile').id, 'dockerfile');
  assert.equal(detectLanguage('/a/Dockerfile.dev').id, 'dockerfile');
  assert.equal(detectLanguage('/a/Gemfile').id, 'ruby');
  assert.equal(detectLanguage('C:\\proj\\src\\main.rs').id, 'rust');
  assert.equal(detectLanguage('/a/README.md'), null);
  assert.equal(detectLanguage('/a/data.json'), null);
  assert.equal(detectLanguageFromShebang('#!/usr/bin/env python3\nprint(1)').id, 'python');
  assert.equal(detectLanguageFromShebang('#!/bin/bash\n').id, 'shell');
});

test('large files lex in linear time', () => {
  const line = 'const value = compute("a // b", /re\\/x/g, `t ${x}`); // note\n';
  const source = line.repeat(20000);
  const started = performance.now();
  const result = lexSource(source, 'javascript');
  const elapsed = performance.now() - started;
  assert.equal(result.ok, true);
  assert.equal(result.comments.length, 20000);
  assert.ok(elapsed < 2000, `lexing 20k lines took ${elapsed}ms`);
});
