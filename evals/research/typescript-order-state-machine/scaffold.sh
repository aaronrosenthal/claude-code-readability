#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-order-state-machine",
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
# fulfilment

Order lifecycle model used by the warehouse and storefront services.
EOF
mkdir -p src
cat > src/errors.ts <<'EOF'
import type { OrderEvent, OrderStatus } from './types.ts';

export class InvalidTransitionError extends Error {
  readonly from: OrderStatus;
  readonly event: OrderEvent;

  constructor(from: OrderStatus, event: OrderEvent) {
    super(`Cannot ${event} an order that is ${from}`);
    this.name = 'InvalidTransitionError';
    this.from = from;
    this.event = event;
  }
}
EOF
mkdir -p src
cat > src/order.ts <<'EOF'
import type { HistoryEntry, OrderEvent, OrderStatus } from './types.ts';

export class Order {
  readonly id: string;
  #now: () => Date;

  constructor(id: string, now: () => Date = () => new Date()) {
    this.id = id;
    this.#now = now;
  }

  get status(): OrderStatus {
    throw new Error('not implemented');
  }

  get history(): HistoryEntry[] {
    throw new Error('not implemented');
  }

  canApply(event: OrderEvent): boolean {
    throw new Error('not implemented');
  }

  apply(event: OrderEvent): void {
    throw new Error('not implemented');
  }
}
EOF
mkdir -p src
cat > src/types.ts <<'EOF'
export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunding'
  | 'refunded';

export type OrderEvent = 'pay' | 'pack' | 'ship' | 'deliver' | 'cancel' | 'refund';

export interface HistoryEntry {
  event: OrderEvent;
  from: OrderStatus;
  to: OrderStatus;
  at: Date;
}
EOF
mkdir -p test
cat > test/order.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Order } from '../src/order.ts';
import { InvalidTransitionError } from '../src/errors.ts';
import type { OrderEvent } from '../src/types.ts';

function ticking(): () => Date {
  let minute = 0;
  return () => new Date(Date.UTC(2025, 0, 6, 9, minute++));
}

function orderAfter(...events: OrderEvent[]): Order {
  const order = new Order('A-1001', ticking());
  for (const event of events) order.apply(event);
  return order;
}

test('a new order is pending with no history', () => {
  const order = new Order('A-1001');
  assert.equal(order.status, 'pending');
  assert.deepEqual(order.history, []);
});

test('the happy path ends in delivered and records every step', () => {
  const order = orderAfter('pay', 'pack', 'ship', 'deliver');

  assert.equal(order.status, 'delivered');
  assert.deepEqual(order.history, [
    { event: 'pay', from: 'pending', to: 'paid', at: new Date('2025-01-06T09:00:00Z') },
    { event: 'pack', from: 'paid', to: 'packed', at: new Date('2025-01-06T09:01:00Z') },
    { event: 'ship', from: 'packed', to: 'shipped', at: new Date('2025-01-06T09:02:00Z') },
    { event: 'deliver', from: 'shipped', to: 'delivered', at: new Date('2025-01-06T09:03:00Z') },
  ]);
});

test('cancelling an unpaid order cancels it outright', () => {
  assert.equal(orderAfter('cancel').status, 'cancelled');
});

test('cancelling a paid or packed order starts a refund', () => {
  assert.equal(orderAfter('pay', 'cancel').status, 'refunding');
  assert.equal(orderAfter('pay', 'pack', 'cancel').status, 'refunding');
});

test('completing the refund finishes a cancelled paid order', () => {
  const order = orderAfter('pay', 'cancel', 'refund');
  assert.equal(order.status, 'refunded');
  assert.deepEqual(
    order.history.map((entry) => entry.event),
    ['pay', 'cancel', 'refund'],
  );
});

test('a delivered order can be refunded', () => {
  assert.equal(orderAfter('pay', 'pack', 'ship', 'deliver', 'refund').status, 'refunded');
});

test('a shipped order cannot be cancelled', () => {
  const order = orderAfter('pay', 'pack', 'ship');

  assert.throws(
    () => order.apply('cancel'),
    (error: unknown) =>
      error instanceof InvalidTransitionError && error.from === 'shipped' && error.event === 'cancel',
  );
});

test('steps cannot be skipped', () => {
  assert.throws(() => orderAfter('pay').apply('ship'), InvalidTransitionError);
  assert.throws(() => new Order('A-1001').apply('deliver'), InvalidTransitionError);
});

test('cancelled and refunded orders reject every event', () => {
  const events: OrderEvent[] = ['pay', 'pack', 'ship', 'deliver', 'cancel', 'refund'];
  for (const finished of [orderAfter('cancel'), orderAfter('pay', 'cancel', 'refund')]) {
    for (const event of events) {
      assert.throws(() => finished.apply(event), InvalidTransitionError);
    }
  }
});

test('a rejected event leaves status and history untouched', () => {
  const order = orderAfter('pay');
  assert.throws(() => order.apply('deliver'), InvalidTransitionError);

  assert.equal(order.status, 'paid');
  assert.equal(order.history.length, 1);
});

test('canApply reports which events are allowed', () => {
  const order = orderAfter('pay');
  assert.equal(order.canApply('pack'), true);
  assert.equal(order.canApply('cancel'), true);
  assert.equal(order.canApply('ship'), false);
});

test('the history getter returns a copy', () => {
  const order = orderAfter('pay');
  order.history.pop();
  assert.equal(order.history.length, 1);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
