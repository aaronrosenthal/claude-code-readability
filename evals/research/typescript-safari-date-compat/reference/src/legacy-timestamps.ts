export type Parser = (input: string) => number;

const LEGACY_FORMAT = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/;

export function parseLegacyTimestamp(value: string, parse: Parser = Date.parse): Date {
  return new Date(parse(toIso8601(value.trim())));
}

export function isValidDate(date: Date): boolean {
  return !Number.isNaN(date.getTime());
}

// The legacy API sends "YYYY-MM-DD HH:MM:SS" in UTC. iOS Safari 15 (WebKit) returns Invalid Date for the
// space-separated form, and other engines read it as local time, so rewrite it to ISO 8601 with an explicit zone.
function toIso8601(value: string): string {
  const match = LEGACY_FORMAT.exec(value);
  if (match === null) return value;

  const [, date, time, zone = 'Z'] = match;
  return `${date}T${time}${zone}`;
}
