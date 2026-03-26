export type ListItemMediaType = 'movie' | 'tv';

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

export const hasExistingListItem = (
  items: ListItemsMap<unknown> | undefined,
  mediaType: ListItemMediaType,
  mediaId: number
): boolean => getListItemFromMap(items, mediaType, mediaId) !== undefined;
