import {
  buildListItemKey,
  hasExistingListItem,
  type ListItemMediaType,
  type ListItemsMap,
} from '@/functions/src/shared/listItemKeys';

export {
  buildListItemKey,
  getLegacyListItemKey,
  getListItemCandidateKeys,
  getListItemFromMap,
} from '@/functions/src/shared/listItemKeys';
export type { ListItemMediaType, ListItemsMap } from '@/functions/src/shared/listItemKeys';

export interface ListItemLike {
  id: number;
  media_type: ListItemMediaType;
}

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
    const mediaId = value?.id;
    if (
      typeof mediaId !== 'number' ||
      !Number.isInteger(mediaId) ||
      (value?.media_type !== 'movie' && value?.media_type !== 'tv')
    ) {
      return;
    }
    const normalizedKey = buildListItemKey(value.media_type, mediaId);
    if (normalizedKey !== key) {
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

    const mediaId = value?.id;

    if (
      !value ||
      typeof mediaId !== 'number' ||
      !Number.isFinite(mediaId) ||
      !Number.isInteger(mediaId) ||
      (value.media_type !== 'movie' && value.media_type !== 'tv')
    ) {
      normalized[key] = value;
      return;
    }

    normalized[buildListItemKey(value.media_type, mediaId)] = value;
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
