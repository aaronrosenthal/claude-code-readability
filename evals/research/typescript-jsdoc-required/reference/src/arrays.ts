/**
 * Splits an array into consecutive chunks of at most `size` items.
 *
 * @param items - The array to split.
 * @param size - Maximum chunk length; must be a positive integer.
 * @returns The chunks, in order. The last chunk may be shorter than `size`.
 * @throws {RangeError} If `size` is not a positive integer.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`size must be a positive integer, got ${size}`);
  }
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

/**
 * Groups items by the string key returned for each one.
 *
 * @param items - The items to group.
 * @param key - Function returning the group key for an item.
 * @returns A map from key to the items with that key, in first-seen key order.
 */
export function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const groupKey = key(item);
    const group = groups.get(groupKey);
    if (group) group.push(item);
    else groups.set(groupKey, [item]);
  }
  return groups;
}

/**
 * Splits items into those that satisfy the predicate and those that do not.
 *
 * @param items - The items to split.
 * @param predicate - Returns true for items that belong in the first list.
 * @returns A pair `[matching, rest]`; each list keeps the original order.
 */
export function partition<T>(items: readonly T[], predicate: (item: T) => boolean): [T[], T[]] {
  const matching: T[] = [];
  const rest: T[] = [];
  for (const item of items) {
    (predicate(item) ? matching : rest).push(item);
  }
  return [matching, rest];
}

/**
 * Removes items whose key has already been seen.
 *
 * @param items - The items to deduplicate.
 * @param key - Function returning the identity key for an item.
 * @returns The first item for each distinct key, in original order.
 */
export function uniqueBy<T>(items: readonly T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const itemKey = key(item);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

/**
 * Counts how many items fall under each key.
 *
 * @param items - The items to count.
 * @param key - Function returning the key for an item.
 * @returns A map from key to count, in first-seen key order.
 */
export function countBy<T>(items: readonly T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const itemKey = key(item);
    counts.set(itemKey, (counts.get(itemKey) ?? 0) + 1);
  }
  return counts;
}
