import type { ListMediaItem } from '@/src/services/ListService';
import { getListItemMediaKey, getStoredListItemRuntime } from '@/src/utils/listFilters';

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

/** The item's stored runtime, else one found after load (keyed by `getListItemMediaKey`). */
export function getItemRuntime(
  item: ListMediaItem,
  runtimes?: Map<string, number>
): number | undefined {
  return getStoredListItemRuntime(item) ?? runtimes?.get(getListItemMediaKey(item));
}

/** The user's rating for the item, if they rated it. */
export function getItemUserRating(
  item: ListMediaItem,
  userRatings?: Map<string, number>
): number | undefined {
  return userRatings?.get(getListItemMediaKey(item));
}

/**
 * Compares two entries by title (A-Z when `direction` is 1). Seasons and episodes sort by their
 * show's name, then by number: the show first, then each season followed by its episodes, so
 * "Season 2" comes before "Season 10", specials come first, and S2E9 comes before S2E10.
 */
export function compareListItemTitles(
  a: ListMediaItem,
  b: ListMediaItem,
  direction: 1 | -1
): number {
  const showOrTitle = (item: ListMediaItem) =>
    ((item.media_type === 'season' || item.media_type === 'episode') && item.show_name
      ? item.show_name
      : item.title || item.name || ''
    ).toLowerCase();
  const byTitle = showOrTitle(a).localeCompare(showOrTitle(b));
  if (byTitle !== 0) return byTitle * direction;

  // Same show: the show itself first, then each season's entry followed by its episodes.
  const order = (item: ListMediaItem): [number, number] => {
    if (item.media_type === 'season') return [item.season_number ?? 0, -1];
    if (item.media_type === 'episode') {
      return [item.season_number ?? 0, item.episode_number ?? 0];
    }
    return [-1, -1];
  };
  const [seasonA, episodeA] = order(a);
  const [seasonB, episodeB] = order(b);
  return (seasonA - seasonB || episodeA - episodeB) * direction;
}
