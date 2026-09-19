/**
 * Timestamp coercion helpers for Firestore values.
 *
 * Pure leaf module (no imports) so UI components, services, and background
 * tasks can share them without pulling in heavier dependency chains.
 * Firestore list-item `addedAt` is a plain number on new writes, but legacy
 * Trakt-sync writes stored Firestore Timestamp objects — these helpers
 * tolerate both shapes.
 */
export const toMillis = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const numericValue = Number(value);
    if (Number.isFinite(numericValue)) {
      return numericValue;
    }

    const parsedDate = Date.parse(value);
    return Number.isNaN(parsedDate) ? null : parsedDate;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.getTime() : null;
  }

  return null;
};

/**
 * Compare two list items by `addedAt` for sorting. Tolerates Firestore
 * Timestamp (and other non-number) values that legacy writers stored;
 * unparseable values sort as 0. Direction follows Array.sort conventions:
 * 1 for ascending, -1 for descending.
 */
export const compareAddedAt = (
  a: { addedAt: unknown },
  b: { addedAt: unknown },
  direction: number = 1
): number => ((toMillis(a.addedAt) ?? 0) - (toMillis(b.addedAt) ?? 0)) * direction;
