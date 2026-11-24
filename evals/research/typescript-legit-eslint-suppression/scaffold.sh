#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "ledger-export",
  "version": "0.8.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "eslint": "^9.0.0"
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
# ledger-export

Nightly export of account transactions from the PayLedger vendor API into our warehouse.

PayLedger returns transactions in pages. Every response carries an opaque `nextToken`, and the next request must send
that token, so pages can only be fetched one after another. The vendor throttles each API key to one request per
second and answers 429s (and eventually blocks the key) if we go faster.
EOF
cat > eslint.config.js <<'EOF'
import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-await-in-loop': 'error',
      'no-console': 'error',
    },
  },
];
EOF
mkdir -p src
cat > src/export.ts <<'EOF'
import type { Transaction, VendorApi } from './vendor-api.ts';

export interface ExportOptions {
  sleep?: (ms: number) => Promise<void>;
  minIntervalMs?: number;
}

export async function exportTransactions(
  api: VendorApi,
  accountId: string,
  options: ExportOptions = {},
): Promise<Transaction[]> {
  throw new Error('not implemented');
}
EOF
mkdir -p src
cat > src/vendor-api.ts <<'EOF'
export interface Transaction {
  id: string;
  accountId: string;
  amountCents: number;
  postedAt: string;
}

export interface TransactionPage {
  transactions: Transaction[];
  nextToken: string | null;
}

export interface VendorApi {
  fetchPage(accountId: string, token?: string): Promise<TransactionPage>;
}
EOF
mkdir -p test
cat > test/export.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportTransactions } from '../src/export.ts';
import type { Transaction, TransactionPage, VendorApi } from '../src/vendor-api.ts';

const tx = (id: string): Transaction => ({ id, accountId: 'acc_1', amountCents: 100, postedAt: '2025-01-01T00:00:00Z' });

function fakeVendor(pages: Record<string, TransactionPage>, events: string[]): VendorApi {
  let inFlight = 0;
  return {
    async fetchPage(_accountId, token) {
      assert.equal(inFlight, 0, 'requests must not overlap');
      inFlight++;
      events.push(`fetch:${token ?? 'first'}`);
      await Promise.resolve();
      inFlight--;
      const page = pages[token ?? 'first'];
      if (page === undefined) throw new Error(`unexpected token ${token}`);
      return page;
    },
  };
}

const threePages = {
  first: { transactions: [tx('t1'), tx('t2')], nextToken: 'p2' },
  p2: { transactions: [tx('t3')], nextToken: 'p3' },
  p3: { transactions: [tx('t4')], nextToken: null },
};

test('follows the continuation tokens and returns every transaction in order', async () => {
  const events: string[] = [];
  const api = fakeVendor(threePages, events);

  const result = await exportTransactions(api, 'acc_1', { sleep: async () => {} });

  assert.deepEqual(result.map((t) => t.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(events, ['fetch:first', 'fetch:p2', 'fetch:p3']);
});

test('waits between requests but not before the first or after the last', async () => {
  const events: string[] = [];
  const api = fakeVendor(threePages, events);

  await exportTransactions(api, 'acc_1', {
    sleep: async (ms) => {
      events.push(`sleep:${ms}`);
    },
  });

  assert.deepEqual(events, ['fetch:first', 'sleep:1100', 'fetch:p2', 'sleep:1100', 'fetch:p3']);
});

test('uses the configured minimum interval', async () => {
  const sleeps: number[] = [];
  const api = fakeVendor(threePages, []);

  await exportTransactions(api, 'acc_1', {
    minIntervalMs: 250,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.deepEqual(sleeps, [250, 250]);
});

test('a single page needs no waiting', async () => {
  const sleeps: number[] = [];
  const api = fakeVendor({ first: { transactions: [tx('only')], nextToken: null } }, []);

  const result = await exportTransactions(api, 'acc_1', {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  assert.equal(result.length, 1);
  assert.deepEqual(sleeps, []);
});

test('an empty account yields an empty export', async () => {
  const api = fakeVendor({ first: { transactions: [], nextToken: null } }, []);
  assert.deepEqual(await exportTransactions(api, 'acc_1', { sleep: async () => {} }), []);
});

test('a failing page rejects the export instead of returning a partial result', async () => {
  const api = fakeVendor({ first: { transactions: [tx('t1')], nextToken: 'missing' } }, []);

  await assert.rejects(exportTransactions(api, 'acc_1', { sleep: async () => {} }), /unexpected token missing/);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
