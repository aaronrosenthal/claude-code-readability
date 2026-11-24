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

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function localDateKey(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClockIn(instant, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function localDayBounds(date: string, timeZone: string): DayBounds {
  return {
    start: localMidnight(date, timeZone),
    end: localMidnight(nextDate(date), timeZone),
  };
}

export function bucketByLocalDay(events: readonly TrackedEvent[], timeZone: string): DayBucket[] {
  const chronological = [...events].sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

  const buckets = new Map<string, TrackedEvent[]>();
  for (const event of chronological) {
    const date = localDateKey(new Date(event.at), timeZone);
    buckets.set(date, [...(buckets.get(date) ?? []), event]);
  }

  return [...buckets].map(([date, dayEvents]) => ({ date, events: dayEvents }));
}

function wallClockIn(instant: Date, timeZone: string): WallClock {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const parts = formatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function offsetAt(instant: Date, timeZone: string): number {
  const { year, month, day, hour, minute, second } = wallClockIn(instant, timeZone);
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return wallClockAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function localMidnight(date: string, timeZone: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const midnightAsUtc = Date.UTC(year, month - 1, day);

  // The offset at midnight-as-UTC can differ from the offset at the real local midnight when a
  // transition falls in between, so measure the offset again at the first guess.
  const firstGuess = midnightAsUtc - offsetAt(new Date(midnightAsUtc), timeZone);
  const corrected = midnightAsUtc - offsetAt(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}
