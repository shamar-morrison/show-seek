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

export const normalizeListItemsMap = <T extends Partial<ListItemLike>>(
  items: ListItemsMap<T> | undefined
): ListItemsMap<T> => {
  if (!items) {
    return {};
  }

  const normalized: ListItemsMap<T> = {};

  Object.entries(items).forEach(([key, value]) => {
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

  return normalized;
};
