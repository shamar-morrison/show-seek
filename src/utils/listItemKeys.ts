import {
  getListItemKey,
  hasExistingListItem,
  type ListEntryMediaType,
  type ListItemRef,
  type ListItemsMap,
} from '@/functions/src/shared/listItemKeys';

export {
  buildEpisodeListItemKey,
  buildListItemKey,
  buildSeasonListItemKey,
  findListItemByRef,
  getLegacyListItemKey,
  getLegacyListItemKeyForRef,
  getListItemCandidateKeys,
  getListItemFromMap,
  getListItemKey,
  getListItemRefCandidateKeys,
  hasListItemByRef,
  isEpisodeListItemKey,
  isEpisodeListItemRef,
  isSeasonListItemKey,
  isSeasonListItemRef,
} from '@/functions/src/shared/listItemKeys';
export type {
  ListEntryMediaType,
  ListItemMediaType,
  ListItemRef,
  ListItemsMap,
} from '@/functions/src/shared/listItemKeys';

export interface ListItemLike {
  id: number;
  media_type: ListEntryMediaType;
  season_number?: number;
  episode_number?: number;
}

/**
 * The identifying fields of a list entry (or anything shaped like one), without its other
 * fields. Seasons and episodes keep their numbers; movies and shows don't carry any.
 */
export const toListItemRef = (item: ListItemLike): ListItemRef => ({
  id: item.id,
  media_type: item.media_type,
  ...(item.media_type === 'season' || item.media_type === 'episode'
    ? { season_number: item.season_number }
    : {}),
  ...(item.media_type === 'episode' ? { episode_number: item.episode_number } : {}),
});

export const hasListItemInMap = hasExistingListItem;

/**
 * An entry holding nothing but `runtimeMinutes`: what a runtime save leaves behind when it
 * writes under the new-style key (`movie-123`) of an item actually stored under its legacy
 * key (`123`). It is never a real item.
 */
export const isRuntimeStampLeftover = (value: unknown): value is { runtimeMinutes?: number } => {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => key === 'runtimeMinutes');
};

/**
 * The key an item is stored under, for each normalized key that differs from it (legacy
 * numeric keys). Writes by field path must use the stored key, or they create a new entry.
 */
export const getStoredListItemKeys = <T extends Partial<ListItemLike>>(
  items: ListItemsMap<T> | undefined
): Record<string, string> => {
  const storedKeys: Record<string, string> = {};
  Object.entries(items ?? {}).forEach(([key, value]) => {
    const normalizedKey = getListItemKey(value);
    if (normalizedKey && normalizedKey !== key) {
      storedKeys[normalizedKey] = key;
    }
  });
  return storedKeys;
};

export const normalizeListItemsMap = <T extends Partial<ListItemLike>>(
  items: ListItemsMap<T> | undefined
): ListItemsMap<T> => {
  if (!items) {
    return {};
  }

  const normalized: ListItemsMap<T> = {};
  const leftovers: [string, { runtimeMinutes?: number }][] = [];

  Object.entries(items).forEach(([key, value]) => {
    if (isRuntimeStampLeftover(value)) {
      leftovers.push([key, value]);
      return;
    }

    const normalizedKey = getListItemKey(value);
    if (!normalizedKey) {
      normalized[key] = value;
      return;
    }

    normalized[normalizedKey] = value;
  });

  // A leftover never replaces the real item; its runtime is kept if the item has none.
  leftovers.forEach(([key, leftover]) => {
    const item = normalized[key] as (T & { runtimeMinutes?: number }) | undefined;
    const minutes = leftover.runtimeMinutes;
    if (
      item &&
      !(item.runtimeMinutes != null && item.runtimeMinutes > 0) &&
      minutes &&
      minutes > 0
    ) {
      normalized[key] = { ...item, runtimeMinutes: minutes };
    }
  });

  return normalized;
};

/**
 * A stable React key / selection key for a list entry. Seasons and episodes of the same show
 * share `id` and must still get distinct keys, so this uses the storage key when there is one.
 */
export const getListItemUiKey = (item: Partial<ListItemLike>): string =>
  getListItemKey(item) ?? `${item.media_type ?? 'unknown'}-${item.id ?? 'unknown'}`;

/**
 * Membership-index key for an entry: `${id}-${media_type}` for movies and shows (unchanged),
 * `${tvId}-season-${seasonNumber}` for seasons, `${tvId}-episode-${seasonNumber}-${episodeNumber}`
 * for episodes. Null when the entry can't be keyed.
 */
export const getListMembershipKey = (
  item: Partial<ListItemLike> | null | undefined
): string | null => {
  if (!item || typeof item.id !== 'number') return null;
  if (item.media_type === 'movie' || item.media_type === 'tv') {
    return `${item.id}-${item.media_type}`;
  }
  if (item.media_type === 'season' && getListItemKey(item)) {
    return `${item.id}-season-${item.season_number}`;
  }
  if (item.media_type === 'episode' && getListItemKey(item)) {
    return `${item.id}-episode-${item.season_number}-${item.episode_number}`;
  }
  return null;
};
