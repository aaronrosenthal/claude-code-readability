#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-slugify",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test"
  }
}
EOF
cat > tsconfig.json <<'EOF'
{
  "compilerOptions": {
    "target": "es2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "strict": true,
    "noEmit": true,
    "erasableSyntaxOnly": true,
    "allowImportingTsExtensions": true,
    "skipLibCheck": true
  },
  "include": [
    "src",
    "test"
  ]
}
EOF
cat > README.md <<'EOF'
# cms-utils

Small helpers used by the CMS when publishing posts.

Run the tests with `npm test`.
EOF
mkdir -p src
cat > src/slugify.ts <<'EOF'
export interface SlugifyOptions {
  maxLength?: number;
  reserved?: readonly string[];
}

export function slugify(title: string, options: SlugifyOptions = {}): string {
  throw new Error('not implemented');
}
EOF
mkdir -p test
cat > test/slugify.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slugify.ts';

test('lowercases and joins words with hyphens', () => {
  assert.equal(slugify('Hello, World!'), 'hello-world');
});

test('transliterates common accented characters', () => {
  assert.equal(slugify('Crème Brûlée à la Maçon'), 'creme-brulee-a-la-macon');
});

test('transliterates letters that do not decompose', () => {
  assert.equal(slugify('Straße Ærø Łódź'), 'strasse-aero-lodz');
});

test('collapses repeated separators and trims the ends', () => {
  assert.equal(slugify('  --Foo   &  Bar-- '), 'foo-bar');
});

test('cuts at a word boundary when over maxLength', () => {
  assert.equal(slugify('The quick brown fox jumps', { maxLength: 15 }), 'the-quick-brown');
  assert.equal(slugify('The quick brown fox jumps', { maxLength: 14 }), 'the-quick');
});

test('hard-cuts a single word longer than maxLength', () => {
  assert.equal(slugify('Supercalifragilistic', { maxLength: 10 }), 'supercalif');
});

test('appends -post to reserved slugs', () => {
  assert.equal(slugify('Admin'), 'admin-post');
  assert.equal(slugify('Pricing', { reserved: ['pricing'] }), 'pricing-post');
  assert.equal(slugify('Pricing'), 'pricing');
});

test('falls back to untitled when nothing is left', () => {
  assert.equal(slugify('???'), 'untitled');
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
