#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-parallel-image-jobs",
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
# image-pipeline

Batch helpers for the media service. `runJobs` is meant to drive thumbnail generation: resize N uploaded images with a
bounded number in flight, because each resize holds a full decoded bitmap in memory.
EOF
mkdir -p src
cat > src/batch.ts <<'EOF'
export interface RunOptions {
  concurrency: number;
  signal?: AbortSignal;
}

export interface JobFailure<J> {
  index: number;
  job: J;
  error: unknown;
}

export interface BatchResult<R, J> {
  results: (R | undefined)[];
  failures: JobFailure<J>[];
  aborted: boolean;
}

export type Worker<J, R> = (job: J, signal: AbortSignal | undefined) => Promise<R>;

export async function runJobs<J, R>(
  jobs: readonly J[],
  worker: Worker<J, R>,
  options: RunOptions,
): Promise<BatchResult<R, J>> {
  throw new Error('not implemented');
}
EOF
mkdir -p test
cat > test/batch.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runJobs } from '../src/batch.ts';

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

test('returns results in input order even when jobs finish out of order', async () => {
  const durations = [30, 5, 15];

  const { results, failures, aborted } = await runJobs(
    durations,
    async (ms, _signal) => {
      await delay(ms);
      return `done-${ms}`;
    },
    { concurrency: 3 },
  );

  assert.deepEqual(results, ['done-30', 'done-5', 'done-15']);
  assert.deepEqual(failures, []);
  assert.equal(aborted, false);
});

test('never runs more than the concurrency limit at once, and uses all of it', async () => {
  let inFlight = 0;
  let peak = 0;

  await runJobs(
    [1, 2, 3, 4, 5, 6],
    async (_job, _signal) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await delay(5);
      inFlight--;
    },
    { concurrency: 2 },
  );

  assert.equal(peak, 2);
});

test('starts the next job as soon as a slot frees up', async () => {
  const finishOrder: string[] = [];
  const jobs = [
    { name: 'slow', ms: 40 },
    { name: 'fast-1', ms: 5 },
    { name: 'fast-2', ms: 5 },
    { name: 'fast-3', ms: 5 },
  ];

  await runJobs(
    jobs,
    async (job, _signal) => {
      await delay(job.ms);
      finishOrder.push(job.name);
    },
    { concurrency: 2 },
  );

  assert.deepEqual(finishOrder, ['fast-1', 'fast-2', 'fast-3', 'slow']);
});

test('collects failures without stopping the other jobs', async () => {
  const { results, failures } = await runJobs(
    ['a', 'b', 'c', 'd'],
    async (name, _signal) => {
      if (name === 'b' || name === 'd') throw new Error(`cannot resize ${name}`);
      return name.toUpperCase();
    },
    { concurrency: 2 },
  );

  assert.deepEqual(results, ['A', undefined, 'C', undefined]);
  assert.deepEqual(
    failures.map((failure) => [failure.index, failure.job, (failure.error as Error).message]),
    [
      [1, 'b', 'cannot resize b'],
      [3, 'd', 'cannot resize d'],
    ],
  );
});

test('passes the abort signal to the worker', async () => {
  const controller = new AbortController();
  const seen: (AbortSignal | undefined)[] = [];

  await runJobs(
    [1],
    async (_job, signal) => {
      seen.push(signal);
    },
    { concurrency: 1, signal: controller.signal },
  );

  assert.equal(seen[0], controller.signal);
});

test('does not start any job when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  let started = 0;

  const { results, aborted } = await runJobs(
    [1, 2, 3],
    async (_job, _signal) => {
      started++;
    },
    { concurrency: 2, signal: controller.signal },
  );

  assert.equal(started, 0);
  assert.deepEqual(results, [undefined, undefined, undefined]);
  assert.equal(aborted, true);
});

test('stops starting jobs once aborted but lets running ones finish', async () => {
  const controller = new AbortController();
  const started: number[] = [];

  const { results, aborted } = await runJobs(
    [0, 1, 2, 3, 4],
    async (job, _signal) => {
      started.push(job);
      if (job === 1) controller.abort();
      await delay(1);
      return job * 10;
    },
    { concurrency: 1, signal: controller.signal },
  );

  assert.deepEqual(started, [0, 1]);
  assert.deepEqual(results, [0, 10, undefined, undefined, undefined]);
  assert.equal(aborted, true);
});

test('handles an empty job list', async () => {
  const outcome = await runJobs([], async (_job: number, _signal) => 1, { concurrency: 4 });
  assert.deepEqual(outcome, { results: [], failures: [], aborted: false });
});

test('rejects a concurrency that is not a positive integer', async () => {
  const worker = async (_job: number, _signal: AbortSignal | undefined) => 1;
  await assert.rejects(runJobs([1], worker, { concurrency: 0 }), RangeError);
  await assert.rejects(runJobs([1], worker, { concurrency: 1.5 }), RangeError);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
