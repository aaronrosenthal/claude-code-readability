#!/usr/bin/env bash
set -euo pipefail
cat > package.json <<'EOF'
{
  "name": "typescript-dst-date-ranges",
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
# activity-report

Daily activity rollups for the dashboard. Event timestamps are stored as UTC ISO strings; customers see days in their
own IANA time zone.
EOF
mkdir -p src
cat > src/local-days.ts <<'EOF'
export interface TrackedEvent {
  id: string;
  at: string;
}

export interface DayBucket {
  date: string;
  events: TrackedEvent[];
}

export interface DayBounds {
  start: Date;
  end: Date;
}

export function localDateKey(instant: Date, timeZone: string): string {
  throw new Error('not implemented');
}

export function localDayBounds(date: string, timeZone: string): DayBounds {
  throw new Error('not implemented');
}

export function bucketByLocalDay(events: readonly TrackedEvent[], timeZone: string): DayBucket[] {
  throw new Error('not implemented');
}
EOF
mkdir -p test
cat > test/local-days.test.ts <<'EOF'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bucketByLocalDay, localDateKey, localDayBounds, type TrackedEvent } from '../src/local-days.ts';

const event = (id: string, at: string): TrackedEvent => ({ id, at });

function bounds(date: string, timeZone: string): [string, string] {
  const { start, end } = localDayBounds(date, timeZone);
  return [start.toISOString(), end.toISOString()];
}

test('localDateKey converts an instant to the calendar date in the zone', () => {
  const instant = new Date('2025-03-10T03:30:00Z');
  assert.equal(localDateKey(instant, 'America/New_York'), '2025-03-09');
  assert.equal(localDateKey(instant, 'Asia/Tokyo'), '2025-03-10');
  assert.equal(localDateKey(instant, 'UTC'), '2025-03-10');
});

test('localDateKey rejects an unknown time zone', () => {
  assert.throws(() => localDateKey(new Date(), 'Mars/Olympus_Mons'), RangeError);
});

test('localDayBounds is 24 hours on an ordinary day, including half-hour zones', () => {
  assert.deepEqual(bounds('2025-06-15', 'Asia/Kolkata'), ['2025-06-14T18:30:00.000Z', '2025-06-15T18:30:00.000Z']);
  assert.deepEqual(bounds('2025-06-15', 'America/New_York'), ['2025-06-15T04:00:00.000Z', '2025-06-16T04:00:00.000Z']);
});

test('localDayBounds is 23 hours when clocks spring forward', () => {
  assert.deepEqual(bounds('2025-03-09', 'America/New_York'), ['2025-03-09T05:00:00.000Z', '2025-03-10T04:00:00.000Z']);
  assert.deepEqual(bounds('2025-03-30', 'Europe/London'), ['2025-03-30T00:00:00.000Z', '2025-03-30T23:00:00.000Z']);
});

test('localDayBounds is 25 hours when clocks fall back', () => {
  assert.deepEqual(bounds('2025-11-02', 'America/New_York'), ['2025-11-02T04:00:00.000Z', '2025-11-03T05:00:00.000Z']);
  assert.deepEqual(bounds('2025-04-06', 'Australia/Sydney'), ['2025-04-05T13:00:00.000Z', '2025-04-06T14:00:00.000Z']);
});

test('buckets events around the spring-forward transition', () => {
  const buckets = bucketByLocalDay(
    [
      event('a', '2025-03-09T04:59:00Z'),
      event('b', '2025-03-09T05:00:00Z'),
      event('c', '2025-03-10T03:59:00Z'),
      event('d', '2025-03-10T04:00:00Z'),
    ],
    'America/New_York',
  );

  assert.deepEqual(
    buckets.map((bucket) => [bucket.date, bucket.events.map((e) => e.id)]),
    [
      ['2025-03-08', ['a']],
      ['2025-03-09', ['b', 'c']],
      ['2025-03-10', ['d']],
    ],
  );
});

test('buckets both occurrences of the repeated hour into the same day on fall-back', () => {
  const buckets = bucketByLocalDay(
    [
      event('first-1am', '2025-11-02T05:30:00Z'),
      event('second-1am', '2025-11-02T06:30:00Z'),
      event('last-minute', '2025-11-03T04:59:00Z'),
      event('next-day', '2025-11-03T05:00:00Z'),
    ],
    'America/New_York',
  );

  assert.deepEqual(
    buckets.map((bucket) => [bucket.date, bucket.events.map((e) => e.id)]),
    [
      ['2025-11-02', ['first-1am', 'second-1am', 'last-minute']],
      ['2025-11-03', ['next-day']],
    ],
  );
});

test('sorts buckets and the events inside them chronologically', () => {
  const buckets = bucketByLocalDay(
    [event('late', '2025-06-02T10:00:00Z'), event('early', '2025-06-01T10:00:00Z'), event('mid', '2025-06-01T12:00:00Z')],
    'UTC',
  );

  assert.deepEqual(
    buckets.map((bucket) => [bucket.date, bucket.events.map((e) => e.id)]),
    [
      ['2025-06-01', ['early', 'mid']],
      ['2025-06-02', ['late']],
    ],
  );
});

test('returns no buckets for no events', () => {
  assert.deepEqual(bucketByLocalDay([], 'Europe/London'), []);
});
EOF
git init -q && git add -A && git -c user.name=eval -c user.email=eval@example.invalid commit -qm fixture
