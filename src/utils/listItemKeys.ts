export type ListItemMediaType = 'movie' | 'tv';

export interface ListItemLike {
  id: number;
  media_type: ListItemMediaType;
}

export type ListItemsMap<T> = Record<string, T>;

export const buildListItemKey = (mediaType: ListItemMediaType, mediaId: number): string =>
  `${mediaType}-${mediaId}`;

export const getLegacyListItemKey = (mediaId: number): string => String(mediaId);

export const getListItemCandidateKeys = (mediaType: ListItemMediaType, mediaId: number): string[] => [
  buildListItemKey(mediaType, mediaId),
  getLegacyListItemKey(mediaId),
];

export const getListItemFromMap = <T>(
  items: ListItemsMap<T> | undefined,
  mediaType: ListItemMediaType,
  mediaId: number
): T | undefined => {
  if (!items) {
    return undefined;
  }

  for (const key of getListItemCandidateKeys(mediaType, mediaId)) {
    if (key in items) {
      return items[key];
    }
  }

  return undefined;
};

export const hasListItemInMap = (
  items: ListItemsMap<unknown> | undefined,
  mediaType: ListItemMediaType,
  mediaId: number
): boolean => getListItemFromMap(items, mediaType, mediaId) !== undefined;

export const normalizeListItemsMap = <T extends Partial<ListItemLike>>(
  items: ListItemsMap<T> | undefined
): ListItemsMap<T> => {
  if (!items) {
    return {};
  }

  const normalized: ListItemsMap<T> = {};

  Object.entries(items).forEach(([key, value]) => {
    if (!value || typeof value.id !== 'number' || (value.media_type !== 'movie' && value.media_type !== 'tv')) {
      normalized[key] = value;
      return;
    }

    normalized[buildListItemKey(value.media_type, value.id)] = value;
  });

  return normalized;
};
