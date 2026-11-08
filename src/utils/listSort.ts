import type { ListMediaItem } from '@/src/services/ListService';
import { getMediaKey } from '@/src/utils/listFilters';

/**
 * Compares two optional numbers for sorting. Missing values always go last, whichever
 * direction is chosen, so unrated items or items with no known runtime never lead the list.
 */
export function compareMissingLast(
  a: number | undefined,
  b: number | undefined,
  direction: 1 | -1
): number {
  const hasA = a !== undefined;
  const hasB = b !== undefined;
  if (!hasA && !hasB) return 0;
  if (!hasA) return 1;
  if (!hasB) return -1;
  return (a - b) * direction;
}

/** The item's stored runtime, else one found after load (keyed by `${media_type}:${id}`). */
export function getItemRuntime(
  item: ListMediaItem,
  runtimes?: Map<string, number>
): number | undefined {
  if (item.runtimeMinutes != null && item.runtimeMinutes > 0) return item.runtimeMinutes;
  return runtimes?.get(getMediaKey(item.media_type, item.id));
}

/** The user's rating for the item, if they rated it. */
export function getItemUserRating(
  item: ListMediaItem,
  userRatings?: Map<string, number>
): number | undefined {
  return userRatings?.get(getMediaKey(item.media_type, item.id));
}
