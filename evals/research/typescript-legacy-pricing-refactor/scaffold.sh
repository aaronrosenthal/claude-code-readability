#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-legacy-pricing-refactor",
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
# usage-billing

Rate card: the first 100 units cost 50 cents each, units 101 to 1000 cost 30 cents each, and everything above 1000 costs
20 cents each. Prices are graduated: each tier's rate applies only to the units inside that tier.
EOF
mkdir -p src
cat > src/pricing.ts <<'EOF'
// Pricing module
// Tiered unit pricing for usage based billing
// (see billing wiki "Usage tiers" for the rate card)

interface Tier {
  upTo: number; // last unit in this tier
  unitCents: number;
}

// tiers, cheapest last
const TIERS: Tier[] = [
  { upTo: 100, unitCents: 50 },
  { upTo: 1000, unitCents: 30 },
  { upTo: Infinity, unitCents: 20 },
];

// calculate the price in cents for a number of units
export function priceForUnits(units: number): number {
  // start with zero
  let total = 0;
  // lower bound of the current tier
  let lower = 0;

  // go through every tier
  for (const tier of TIERS) {
    // if we have no units left in this tier stop
    if (units <= lower) break;

    // how many units fall in this tier
    const inTier = Math.min(units, tier.upTo) - lower;
    // add the cost
    total += inTier * tier.unitCents;

    // move the lower bound up
    lower = tier.upTo + 1;
  }

  // const VOLUME_DISCOUNT = 0.05;
  // if (units > 5000) {
  //   total = Math.round(total * (1 - VOLUME_DISCOUNT));
  // }

  // return the total
  return total;
}

// average price per unit in cents
export function averageUnitCents(units: number): number {
  if (units === 0) return 0;
  return priceForUnits(units) / units;
}

// format cents as a dollar string
export function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
EOF
mkdir -p test
cat > test/pricing.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { averageUnitCents, formatPrice, priceForUnits } from '../src/pricing.ts';

test('no usage costs nothing', () => {
  assert.equal(priceForUnits(0), 0);
});

test('the first tier is 50 cents a unit', () => {
  assert.equal(priceForUnits(1), 50);
  assert.equal(priceForUnits(100), 5000);
});

test('the 101st unit is the first one billed at the second-tier rate', () => {
  assert.equal(priceForUnits(101), 5030);
  assert.equal(priceForUnits(150), 6500);
});

test('the top of the second tier is unit 1000', () => {
  assert.equal(priceForUnits(1000), 5000 + 900 * 30);
});

test('the 1001st unit is the first one billed at the third-tier rate', () => {
  assert.equal(priceForUnits(1001), 5000 + 900 * 30 + 20);
  assert.equal(priceForUnits(2500), 5000 + 900 * 30 + 1500 * 20);
});

test('averageUnitCents divides the total by the units', () => {
  assert.equal(averageUnitCents(0), 0);
  assert.equal(averageUnitCents(100), 50);
  assert.equal(averageUnitCents(200), (5000 + 100 * 30) / 200);
});

test('formatPrice renders cents as dollars', () => {
  assert.equal(formatPrice(5030), '$50.30');
  assert.equal(formatPrice(5), '$0.05');
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
