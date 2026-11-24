#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-fetch-retry-errors",
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
# http-client

Thin wrapper around `fetch` used by the inventory sync job. `fetch` and `sleep` are injected so tests never touch the
network or the clock.
EOF
mkdir -p src
cat > src/http-client.ts <<'EOF'
export type FetchLike = (url: string) => Promise<Response>;

export interface ClientOptions {
  fetch: FetchLike;
  sleep: (ms: number) => Promise<void>;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export type FetchError =
  | { kind: 'client'; status: number; body: string }
  | { kind: 'server'; status: number; attempts: number }
  | { kind: 'network'; message: string; attempts: number }
  | { kind: 'invalid-json'; status: number };

export type FetchResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: FetchError };

export async function fetchJson<T>(url: string, options: ClientOptions): Promise<FetchResult<T>> {
  throw new Error('not implemented');
}
EOF
mkdir -p test
cat > test/http-client.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchJson, type FetchLike } from '../src/http-client.ts';

type Step = Response | Error;

function scripted(...steps: Step[]) {
  const urls: string[] = [];
  const sleeps: number[] = [];
  const queue = [...steps];
  const fetch: FetchLike = async (url) => {
    urls.push(url);
    const step = queue.shift();
    if (step === undefined) throw new Error('fetch called more times than scripted');
    if (step instanceof Error) throw step;
    return step;
  };
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  return { urls, sleeps, options: { fetch, sleep } };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const status = (code: number, body = '') => new Response(body, { status: code });

test('returns the parsed body on the first success', async () => {
  const { options, urls, sleeps } = scripted(json({ sku: 'A1', qty: 4 }));

  const result = await fetchJson('https://api.test/items/A1', options);

  assert.deepEqual(result, { ok: true, value: { sku: 'A1', qty: 4 }, attempts: 1 });
  assert.deepEqual(urls, ['https://api.test/items/A1']);
  assert.deepEqual(sleeps, []);
});

test('retries a 5xx response and succeeds', async () => {
  const { options, sleeps } = scripted(status(500), json({ ok: 1 }));

  const result = await fetchJson('https://api.test/x', options);

  assert.deepEqual(result, { ok: true, value: { ok: 1 }, attempts: 2 });
  assert.deepEqual(sleeps, [200]);
});

test('gives up after four attempts with exponential backoff', async () => {
  const { options, sleeps, urls } = scripted(status(503), status(502), status(500), status(503));

  const result = await fetchJson('https://api.test/x', options);

  assert.deepEqual(result, { ok: false, error: { kind: 'server', status: 503, attempts: 4 } });
  assert.deepEqual(sleeps, [200, 400, 800]);
  assert.equal(urls.length, 4);
});

test('retries network errors and reports the last message when they persist', async () => {
  const flaky = scripted(new TypeError('socket hang up'), json({ ok: 1 }));
  assert.deepEqual(await fetchJson('https://api.test/x', flaky.options), { ok: true, value: { ok: 1 }, attempts: 2 });

  const down = scripted(
    new TypeError('connect ECONNREFUSED'),
    new TypeError('connect ECONNREFUSED'),
    new TypeError('connect ECONNREFUSED'),
    new TypeError('getaddrinfo ENOTFOUND'),
  );
  assert.deepEqual(await fetchJson('https://api.test/x', down.options), {
    ok: false,
    error: { kind: 'network', message: 'getaddrinfo ENOTFOUND', attempts: 4 },
  });
});

test('never retries a 4xx response', async () => {
  for (const code of [400, 404, 408, 429]) {
    const { options, urls, sleeps } = scripted(status(code, 'nope'));

    const result = await fetchJson('https://api.test/x', options);

    assert.deepEqual(result, { ok: false, error: { kind: 'client', status: code, body: 'nope' } });
    assert.equal(urls.length, 1);
    assert.deepEqual(sleeps, []);
  }
});

test('a 2xx response with a malformed body is not retried', async () => {
  const { options, urls } = scripted(new Response('<html>oops</html>', { status: 200 }));

  const result = await fetchJson('https://api.test/x', options);

  assert.deepEqual(result, { ok: false, error: { kind: 'invalid-json', status: 200 } });
  assert.equal(urls.length, 1);
});

test('maxAttempts and baseDelayMs are configurable', async () => {
  const { options, sleeps } = scripted(status(500), status(500));

  const result = await fetchJson('https://api.test/x', { ...options, maxAttempts: 2, baseDelayMs: 50 });

  assert.deepEqual(result, { ok: false, error: { kind: 'server', status: 500, attempts: 2 } });
  assert.deepEqual(sleeps, [50]);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
