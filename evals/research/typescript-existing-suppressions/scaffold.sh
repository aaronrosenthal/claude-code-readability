#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-existing-suppressions",
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
# payments-webhooks

Receives webhooks from the payment provider and turns them into local state changes and background jobs.
EOF
mkdir -p src
cat > src/queue-sdk.ts <<'EOF'
export interface JobInput {
  name: string;
  payload: Record<string, unknown>;
}

export interface JobQueue {
  enqueue(job: JobInput): void;
}
EOF
mkdir -p src
cat > src/webhook-handler.ts <<'EOF'
import type { JobQueue } from './queue-sdk.ts';

export interface WebhookDeps {
  invoices: { markPaid(invoiceId: string): void };
  subscriptions: { cancel(subscriptionId: string, reason: string): boolean };
  queue: JobQueue;
}

export interface HandlerResult {
  status: 'handled' | 'ignored' | 'duplicate';
}

export function handleWebhook(rawBody: string, deps: WebhookDeps): HandlerResult {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webhook payloads are untyped JSON from the provider
  const event: any = JSON.parse(rawBody);

  switch (event.type) {
    case 'invoice.paid':
      deps.invoices.markPaid(event.data.id);
      return { status: 'handled' };

    case 'invoice.payment_failed':
      deps.queue.enqueue({
        name: 'send-dunning-email',
        payload: { invoiceId: event.data.id, attempt: event.data.attempt_count },
        // @ts-expect-error -- the SDK's types omit the 'priority' field (fixed in v5)
        priority: 'high',
      });
      return { status: 'handled' };

    default:
      return { status: 'ignored' };
  }
}
EOF
mkdir -p test
cat > test/webhook-handler.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleWebhook, type WebhookDeps } from '../src/webhook-handler.ts';

function setup(cancelResult = true) {
  const paid: string[] = [];
  const canceled: [string, string][] = [];
  const jobs: unknown[] = [];
  const deps: WebhookDeps = {
    invoices: { markPaid: (id) => void paid.push(id) },
    subscriptions: {
      cancel: (id, reason) => {
        canceled.push([id, reason]);
        return cancelResult;
      },
    },
    queue: { enqueue: (job) => void jobs.push(job) },
  };
  return { deps, paid, canceled, jobs };
}

const body = (type: string, data: Record<string, unknown>) => JSON.stringify({ type, data });

test('invoice.paid marks the invoice paid', () => {
  const { deps, paid } = setup();
  assert.deepEqual(handleWebhook(body('invoice.paid', { id: 'in_1' }), deps), { status: 'handled' });
  assert.deepEqual(paid, ['in_1']);
});

test('invoice.payment_failed enqueues a high priority dunning email', () => {
  const { deps, jobs } = setup();
  handleWebhook(body('invoice.payment_failed', { id: 'in_2', attempt_count: 3 }), deps);
  assert.deepEqual(jobs, [
    { name: 'send-dunning-email', payload: { invoiceId: 'in_2', attempt: 3 }, priority: 'high' },
  ]);
});

test('unknown event types are ignored', () => {
  const { deps, jobs } = setup();
  assert.deepEqual(handleWebhook(body('charge.refunded', { id: 'ch_1' }), deps), { status: 'ignored' });
  assert.deepEqual(jobs, []);
});

test('malformed JSON throws', () => {
  assert.throws(() => handleWebhook('{nope', setup().deps), SyntaxError);
});

test('customer.subscription.deleted cancels locally and queues a low priority win-back email', () => {
  const { deps, canceled, jobs } = setup();

  const result = handleWebhook(
    body('customer.subscription.deleted', { id: 'sub_9', customer: 'cus_4', cancellation_reason: 'too_expensive' }),
    deps,
  );

  assert.deepEqual(result, { status: 'handled' });
  assert.deepEqual(canceled, [['sub_9', 'too_expensive']]);
  assert.deepEqual(jobs, [
    { name: 'send-winback-email', payload: { subscriptionId: 'sub_9', customerId: 'cus_4' }, priority: 'low' },
  ]);
});

test('a missing cancellation reason is recorded as unspecified', () => {
  const { deps, canceled } = setup();
  handleWebhook(body('customer.subscription.deleted', { id: 'sub_9', customer: 'cus_4' }), deps);
  assert.deepEqual(canceled, [['sub_9', 'unspecified']]);
});

test('a redelivered cancellation is a duplicate and sends no second email', () => {
  const { deps, jobs } = setup(false);

  const result = handleWebhook(body('customer.subscription.deleted', { id: 'sub_9', customer: 'cus_4' }), deps);

  assert.deepEqual(result, { status: 'duplicate' });
  assert.deepEqual(jobs, []);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
