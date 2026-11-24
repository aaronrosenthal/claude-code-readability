#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-invoice-proration",
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
# billing

Invoice helpers for the subscriptions service. Amounts are integer cents; dates are ISO `YYYY-MM-DD` strings.
EOF
mkdir -p src
cat > src/dates.ts <<'EOF'
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function parseIsoDate(value: string): number {
  const [year, month, day] = value.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseIsoDate(to) - parseIsoDate(from)) / MS_PER_DAY);
}
EOF
mkdir -p src
cat > src/money.ts <<'EOF'
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const dollars = Math.floor(absolute / 100);
  const remainder = String(absolute % 100).padStart(2, '0');
  return `${sign}$${dollars}.${remainder}`;
}
EOF
mkdir -p src
cat > src/proration.ts <<'EOF'
export interface Plan {
  name: string;
  monthlyPriceCents: number;
}

export interface PlanChange {
  from: Plan;
  to: Plan;
  cycleStart: string;
  cycleEnd: string;
  changeDate: string;
}

export interface InvoiceLine {
  description: string;
  amountCents: number;
}

export interface Proration {
  lines: InvoiceLine[];
  totalCents: number;
}

export function prorateMidCycleChange(change: PlanChange): Proration {
  throw new Error('not implemented');
}
EOF
mkdir -p test
cat > test/proration.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prorateMidCycleChange, type PlanChange } from '../src/proration.ts';

const starter = { name: 'Starter', monthlyPriceCents: 1000 };
const pro = { name: 'Pro', monthlyPriceCents: 2900 };

function marchChange(overrides: Partial<PlanChange> = {}): PlanChange {
  return {
    from: starter,
    to: pro,
    cycleStart: '2025-03-01',
    cycleEnd: '2025-04-01',
    changeDate: '2025-03-11',
    ...overrides,
  };
}

test('upgrade mid-cycle credits the old plan and charges the new plan for the remaining days', () => {
  const result = prorateMidCycleChange(marchChange());

  assert.deepEqual(result.lines, [
    { description: 'Credit: unused Starter', amountCents: -677 },
    { description: 'Charge: remaining Pro', amountCents: 1965 },
  ]);
  assert.equal(result.totalCents, 1288);
});

test('downgrade produces a net credit', () => {
  const result = prorateMidCycleChange(marchChange({ from: pro, to: starter }));

  assert.deepEqual(
    result.lines.map((line) => line.amountCents),
    [-1965, 677],
  );
  assert.equal(result.totalCents, -1288);
});

test('exact halves round away from zero, including on the credit', () => {
  const result = prorateMidCycleChange({
    from: { name: 'Legacy', monthlyPriceCents: 1005 },
    to: { name: 'Team', monthlyPriceCents: 3005 },
    cycleStart: '2025-04-01',
    cycleEnd: '2025-05-01',
    changeDate: '2025-04-30',
  });

  assert.deepEqual(
    result.lines.map((line) => line.amountCents),
    [-34, 100],
  );
});

test('a change on the first day of the cycle covers the whole cycle', () => {
  const result = prorateMidCycleChange(marchChange({ changeDate: '2025-03-01' }));

  assert.deepEqual(
    result.lines.map((line) => line.amountCents),
    [-1000, 2900],
  );
});

test('leap-year February has 29 days', () => {
  const result = prorateMidCycleChange(
    marchChange({ cycleStart: '2024-02-01', cycleEnd: '2024-03-01', changeDate: '2024-02-15' }),
  );

  assert.deepEqual(
    result.lines.map((line) => line.amountCents),
    [-517, 1500],
  );
});

test('a free plan yields a zero credit, not negative zero', () => {
  const result = prorateMidCycleChange(marchChange({ from: { name: 'Free', monthlyPriceCents: 0 } }));

  assert.equal(result.lines[0].amountCents, 0);
  assert.equal(result.totalCents, 1965);
});

test('rejects a change date outside the billing cycle', () => {
  assert.throws(() => prorateMidCycleChange(marchChange({ changeDate: '2025-02-28' })), RangeError);
  assert.throws(() => prorateMidCycleChange(marchChange({ changeDate: '2025-04-01' })), RangeError);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
