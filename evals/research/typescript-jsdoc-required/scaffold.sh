#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "array-kit",
  "version": "1.4.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "eslint ."
  },
  "devDependencies": {
    "eslint": "^9.0.0",
    "eslint-plugin-jsdoc": "^50.0.0"
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
cat > CONTRIBUTING.md <<'EOF'
# Contributing

- Run `npm test` and `npm run lint` before opening a PR. CI runs both and lint must pass.
- Public API is documented with JSDoc; `jsdoc/require-jsdoc` is enforced for exported functions and classes.
- New helpers go in `src/arrays.ts` and are re-exported from `src/index.ts`.
EOF
cat > README.md <<'EOF'
# array-kit

Small, dependency-free array helpers shared by our internal services.
EOF
cat > eslint.config.js <<'EOF'
import jsdoc from 'eslint-plugin-jsdoc';

export default [
  jsdoc.configs['flat/recommended-typescript'],
  {
    files: ['src/**/*.ts'],
    rules: {
      'jsdoc/require-jsdoc': ['error', { publicOnly: true, require: { FunctionDeclaration: true, ClassDeclaration: true } }],
    },
  },
];
EOF
mkdir -p src
cat > src/arrays.ts <<'EOF'
/**
 * Splits an array into consecutive chunks of at most `size` items.
 *
 * @param items - The array to split.
 * @param size - Maximum chunk length; must be a positive integer.
 * @returns The chunks, in order. The last chunk may be shorter than `size`.
 * @throws {RangeError} If `size` is not a positive integer.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Groups items by the string key returned for each one.
 *
 * @param items - The items to group.
 * @param key - Function returning the group key for an item.
 * @returns A map from key to the items with that key, in first-seen key order.
 */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey);
    if (group) group.push(item);
    else groups.set(groupKey, [item]);
  }
  return groups;
}
EOF
mkdir -p src
cat > src/index.ts <<'EOF'
export { chunk, groupBy } from './arrays.ts';
EOF
mkdir -p test
cat > test/arrays.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunk, countBy, groupBy, partition, uniqueBy } from '../src/index.ts';

test('chunk splits into fixed-size pieces', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test('groupBy groups in first-seen key order', () => {
  const groups = groupBy(['apple', 'avocado', 'banana'], (word) => word[0]);
  assert.deepEqual([...groups], [
    ['a', ['apple', 'avocado']],
    ['b', ['banana']],
  ]);
});

test('partition splits items into matches and non-matches, preserving order', () => {
  assert.deepEqual(
    partition([1, 2, 3, 4, 5, 6], (n) => n % 2 === 0),
    [[2, 4, 6], [1, 3, 5]],
  );
  assert.deepEqual(partition([], () => true), [[], []]);
});

test('uniqueBy keeps the first item for each key', () => {
  const users = [
    { id: 1, email: 'a@example.com' },
    { id: 2, email: 'b@example.com' },
    { id: 3, email: 'a@example.com' },
  ];
  assert.deepEqual(uniqueBy(users, (user) => user.email).map((user) => user.id), [1, 2]);
});

test('countBy counts items per key in first-seen order', () => {
  const counts = countBy(['ok', 'fail', 'ok', 'ok', 'fail', 'skipped'], (status) => status);
  assert.deepEqual([...counts], [
    ['ok', 3],
    ['fail', 2],
    ['skipped', 1],
  ]);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
