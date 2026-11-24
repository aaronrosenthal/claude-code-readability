const DEFAULT_MAX_LENGTH = 60;
const DEFAULT_RESERVED = ['admin', 'api', 'new', 'edit', 'login'];

const NON_DECOMPOSING_LETTERS: Record<string, string> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
};

export interface SlugifyOptions {
  maxLength?: number;
  reserved?: readonly string[];
}

export function slugify(title: string, options: SlugifyOptions = {}): string {
  const { maxLength = DEFAULT_MAX_LENGTH, reserved = DEFAULT_RESERVED } = options;

  const slug = truncateAtWordBoundary(toSlug(title), maxLength);
  if (slug === '') return 'untitled';
  return reserved.includes(slug) ? `${slug}-post` : slug;
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[ßæœøłđðþ]/g, (letter) => NON_DECOMPOSING_LETTERS[letter])
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function truncateAtWordBoundary(slug: string, maxLength: number): string {
  if (slug.length <= maxLength) return slug;

  const lastHyphen = slug.lastIndexOf('-', maxLength);
  return lastHyphen > 0 ? slug.slice(0, lastHyphen) : slug.slice(0, maxLength);
}
