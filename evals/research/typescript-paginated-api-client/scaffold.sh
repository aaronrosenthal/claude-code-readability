#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-paginated-api-client",
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
# helpdesk-sync

Client for the Helpdesk REST API, used by the nightly export.

`GET {baseUrl}/tickets?limit=100[&cursor=...]` with `Authorization: Bearer <token>` responds with

```json
{ "data": [{ "id": 1, "subject": "...", "status": "open" }], "next_cursor": "opaque-string-or-null" }
```

When the rate limit is hit the API answers `429` with a `Retry-After` header in whole seconds.
EOF
mkdir -p src
cat > src/errors.ts <<'EOF'
export class TicketsApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'TicketsApiError';
    this.status = status;
  }
}
EOF
mkdir -p src
cat > src/tickets-client.ts <<'EOF'
import type { FetchLike, Ticket, TicketPage } from './types.ts';

export interface TicketsClientOptions {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  maxRateLimitRetries?: number;
}

export class TicketsClient {
  #options: TicketsClientOptions;

  constructor(options: TicketsClientOptions) {
    this.#options = options;
  }

  async listPage(cursor?: string): Promise<TicketPage> {
    throw new Error('not implemented');
  }

  async *listAll(): AsyncGenerator<Ticket> {
    throw new Error('not implemented');
  }
}
EOF
mkdir -p src
cat > src/types.ts <<'EOF'
export interface Ticket {
  id: number;
  subject: string;
  status: 'open' | 'pending' | 'closed';
}

export interface TicketPage {
  tickets: Ticket[];
  nextCursor: string | null;
}

export type FetchLike = (url: string, init: { headers: Record<string, string> }) => Promise<Response>;
EOF
mkdir -p test
cat > test/tickets-client.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TicketsClient } from '../src/tickets-client.ts';
import { TicketsApiError } from '../src/errors.ts';
import type { Ticket } from '../src/types.ts';

const ticket = (id: number): Ticket => ({ id, subject: `Ticket ${id}`, status: 'open' });
const page = (ids: number[], nextCursor: string | null) =>
  new Response(JSON.stringify({ data: ids.map(ticket), next_cursor: nextCursor }), { status: 200 });
const rateLimited = (retryAfter?: string) =>
  new Response('', { status: 429, headers: retryAfter === undefined ? {} : { 'Retry-After': retryAfter } });

function setup(responses: Response[], maxRateLimitRetries?: number) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const client = new TicketsClient({
    baseUrl: 'https://desk.test/api/v2',
    token: 'tok_123',
    maxRateLimitRetries,
    fetch: async (url, init) => {
      calls.push({ url, headers: init.headers });
      const next = queue.shift();
      if (next === undefined) throw new Error('unexpected extra request');
      return next;
    },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, calls, sleeps };
}

async function collect(client: TicketsClient): Promise<number[]> {
  const ids: number[] = [];
  for await (const item of client.listAll()) ids.push(item.id);
  return ids;
}

test('listPage requests the first page with the bearer token', async () => {
  const { client, calls } = setup([page([1, 2], 'c2')]);

  const result = await client.listPage();

  assert.deepEqual(result, { tickets: [ticket(1), ticket(2)], nextCursor: 'c2' });
  assert.equal(calls[0].url, 'https://desk.test/api/v2/tickets?limit=100');
  assert.equal(calls[0].headers.Authorization, 'Bearer tok_123');
});

test('listPage url-encodes the cursor', async () => {
  const { client, calls } = setup([page([3], null)]);

  const result = await client.listPage('abc==/x');

  assert.equal(result.nextCursor, null);
  assert.equal(calls[0].url, 'https://desk.test/api/v2/tickets?limit=100&cursor=abc%3D%3D%2Fx');
});

test('listAll walks every page in order and stops at the last one', async () => {
  const { client, calls } = setup([page([1, 2], 'c2'), page([3, 4], 'c3'), page([5], null)]);

  assert.deepEqual(await collect(client), [1, 2, 3, 4, 5]);
  assert.equal(calls.length, 3);
  assert.match(calls[2].url, /cursor=c3$/);
});

test('listAll fetches pages lazily', async () => {
  const { client, calls } = setup([page([1, 2], 'c2'), page([3], null)]);

  for await (const first of client.listAll()) {
    assert.equal(first.id, 1);
    break;
  }

  assert.equal(calls.length, 1);
});

test('waits for Retry-After on a 429 and retries the same page', async () => {
  const { client, calls, sleeps } = setup([page([1], 'c2'), rateLimited('2'), page([2], null)]);

  assert.deepEqual(await collect(client), [1, 2]);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(calls[1].url, calls[2].url);
});

test('defaults to one second when Retry-After is missing', async () => {
  const { client, sleeps } = setup([rateLimited(), page([1], null)]);

  await client.listPage();

  assert.deepEqual(sleeps, [1000]);
});

test('the rate-limit retry budget applies per page', async () => {
  const { client, sleeps } = setup(
    [rateLimited('1'), page([1], 'c2'), rateLimited('1'), page([2], null)],
    1,
  );

  assert.deepEqual(await collect(client), [1, 2]);
  assert.deepEqual(sleeps, [1000, 1000]);
});

test('throws once the rate-limit retries are used up', async () => {
  const { client, calls } = setup([rateLimited('1'), rateLimited('1'), rateLimited('1')], 2);

  await assert.rejects(
    client.listPage(),
    (error: unknown) => error instanceof TicketsApiError && error.status === 429,
  );
  assert.equal(calls.length, 3);
});

test('other errors are thrown immediately with their status', async () => {
  for (const status of [401, 404, 500]) {
    const { client, calls } = setup([new Response('', { status })]);

    await assert.rejects(
      client.listPage(),
      (error: unknown) => error instanceof TicketsApiError && error.status === status,
    );
    assert.equal(calls.length, 1);
  }
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
