import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { renderDirectiveDocs } from '../../scripts/dev/generate-docs.mjs';

test('docs/directives.md matches the registry', () => {
  const current = fs.readFileSync(new URL('../../docs/directives.md', import.meta.url), 'utf8');
  assert.equal(current, renderDirectiveDocs(), 'run node scripts/dev/generate-docs.mjs');
});

test('the skill frontmatter starts on the first line', () => {
  const skill = fs.readFileSync(new URL('../../skills/readable-code/SKILL.md', import.meta.url), 'utf8');
  assert.match(skill, /^---\nname: readable-code\n/);
});
