#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-safari-date-compat",
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
# billing-web

Front-end helpers for the billing portal. Timestamps from the legacy billing API are strings; `parseLegacyTimestamp`
turns them into `Date` values.
EOF
mkdir -p src
cat > src/invoice-history.ts <<'EOF'
import { isValidDate, parseLegacyTimestamp } from './legacy-timestamps.ts';

export interface InvoiceRow {
  number: string;
  issuedAt: string;
}

export function describeIssueDate(row: InvoiceRow): string {
  const issued = parseLegacyTimestamp(row.issuedAt);
  return isValidDate(issued) ? issued.toISOString().slice(0, 10) : 'Unknown date';
}
EOF
mkdir -p src
cat > src/legacy-timestamps.ts <<'EOF'
export type Parser = (input: string) => number;

export function parseLegacyTimestamp(value: string, parse: Parser = Date.parse): Date {
  return new Date(parse(value));
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}
EOF
mkdir -p test
cat > test/legacy-timestamps.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidDate, parseLegacyTimestamp, type Parser } from '../src/legacy-timestamps.ts';
import { describeIssueDate } from '../src/invoice-history.ts';

process.env.TZ = 'America/Los_Angeles';

const strictIso: Parser = (input) =>
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(input) ? Date.parse(input) : Number.NaN;

test('the strict parser really rejects the legacy format', () => {
  assert.ok(Number.isNaN(strictIso('2024-03-05 14:30:00')));
});

test('parses the legacy space-separated form as UTC with a strict parser', () => {
  const parsed = parseLegacyTimestamp('2024-03-05 14:30:00', strictIso);
  assert.equal(parsed.getTime(), Date.UTC(2024, 2, 5, 14, 30, 0));
});

test('parses the legacy form as UTC with the platform parser regardless of local time zone', () => {
  assert.equal(parseLegacyTimestamp('2024-03-05 14:30:00').getTime(), Date.UTC(2024, 2, 5, 14, 30, 0));
});

test('keeps fractional seconds', () => {
  const parsed = parseLegacyTimestamp('2024-03-05 14:30:00.123', strictIso);
  assert.equal(parsed.getTime(), Date.UTC(2024, 2, 5, 14, 30, 0, 123));
});

test('respects an explicit UTC offset', () => {
  const parsed = parseLegacyTimestamp('2024-03-05 14:30:00+02:00', strictIso);
  assert.equal(parsed.toISOString(), '2024-03-05T12:30:00.000Z');
});

test('passes ISO 8601 timestamps and plain dates through unchanged', () => {
  assert.equal(parseLegacyTimestamp('2024-03-05T14:30:00Z', strictIso).toISOString(), '2024-03-05T14:30:00.000Z');
  assert.equal(parseLegacyTimestamp('2024-03-05', strictIso).toISOString(), '2024-03-05T00:00:00.000Z');
});

test('tolerates surrounding whitespace', () => {
  assert.equal(parseLegacyTimestamp(' 2024-03-05 14:30:00 ', strictIso).toISOString(), '2024-03-05T14:30:00.000Z');
});

test('garbage still produces an invalid date', () => {
  assert.equal(isValidDate(parseLegacyTimestamp('not a date', strictIso)), false);
  assert.equal(isValidDate(parseLegacyTimestamp('', strictIso)), false);
});

test('describeIssueDate shows the UTC calendar date', () => {
  assert.equal(describeIssueDate({ number: 'INV-1', issuedAt: '2024-03-05 23:30:00' }), '2024-03-05');
  assert.equal(describeIssueDate({ number: 'INV-2', issuedAt: 'garbage' }), 'Unknown date');
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
