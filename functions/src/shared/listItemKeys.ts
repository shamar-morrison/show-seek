/** Title-level media types: the ones keyed by their own TMDB ID (`movie-123`, `tv-456`). */
export type ListItemMediaType = 'movie' | 'tv';

/**
 * Every kind of entry a list can hold. A season is stored with its show's TMDB ID as `id` plus
 * its `season_number`, and keyed `season-{tvId}-{seasonNumber}` (the same shape season ratings
 * use). It never has a legacy numeric key.
 */
export type ListEntryMediaType = ListItemMediaType | 'season';

/** The fields that identify a list entry. `season_number` is required when it's a season. */
export interface ListItemRef {
  id: number;
  media_type: ListEntryMediaType;
  season_number?: number;
}

export type ListItemsMap<T> = Record<string, T>;

export const buildListItemKey = (mediaType: ListItemMediaType, mediaId: number): string =>
  `${mediaType}-${mediaId}`;

export const buildSeasonListItemKey = (tvId: number, seasonNumber: number): string =>
  `season-${tvId}-${seasonNumber}`;

export const SEASON_LIST_ITEM_KEY_PATTERN = /^season-(\d+)-(\d+)$/;

export const isSeasonListItemKey = (key: string): boolean => SEASON_LIST_ITEM_KEY_PATTERN.test(key);

export const getLegacyListItemKey = (mediaId: number): string => String(mediaId);

export const getListItemCandidateKeys = (mediaType: ListItemMediaType, mediaId: number): string[] => [
  buildListItemKey(mediaType, mediaId),
  getLegacyListItemKey(mediaId),
];

const isWholeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0;

/** True for a season entry with a usable show ID and season number (season 0 included). */
export const isSeasonListItemRef = (
  ref: Partial<ListItemRef> | null | undefined
): ref is ListItemRef & { media_type: 'season'; season_number: number } =>
  !!ref &&
  ref.media_type === 'season' &&
  isWholeNumber(ref.id) &&
  ref.id > 0 &&
  isWholeNumber(ref.season_number);

/**
 * The canonical key an entry is stored under, or null when the entry can't be keyed (an
 * unknown media type, or a season without a valid season number).
 */
export const getListItemKey = (ref: Partial<ListItemRef> | null | undefined): string | null => {
  if (!ref || typeof ref.id !== 'number' || !Number.isInteger(ref.id)) {
    return null;
  }
  if (ref.media_type === 'movie' || ref.media_type === 'tv') {
    return buildListItemKey(ref.media_type, ref.id);
  }
  if (isSeasonListItemRef(ref)) {
    return buildSeasonListItemKey(ref.id, ref.season_number);
  }
  return null;
};

/**
 * Every key an entry may be stored under. Movies and shows may still sit under a legacy numeric
 * key; seasons never do, so a season must never touch the numeric key (that would hit the show,
 * or a movie with the same number).
 */
export const getListItemRefCandidateKeys = (ref: Partial<ListItemRef> | null | undefined): string[] => {
  if (!ref || typeof ref.id !== 'number') {
    return [];
  }
  if (ref.media_type === 'movie' || ref.media_type === 'tv') {
    return getListItemCandidateKeys(ref.media_type, ref.id);
  }
  const key = getListItemKey(ref);
  return key ? [key] : [];
};

/** The legacy numeric key a write should clear, or null for entries that never have one. */
export const getLegacyListItemKeyForRef = (
  ref: Partial<ListItemRef> | null | undefined
): string | null =>
  ref && (ref.media_type === 'movie' || ref.media_type === 'tv') && typeof ref.id === 'number'
    ? getLegacyListItemKey(ref.id)
    : null;

export const findListItemByRef = <T>(
  items: ListItemsMap<T> | undefined,
  ref: Partial<ListItemRef> | null | undefined
): T | undefined => {
  if (!items) {
    return undefined;
  }
  for (const key of getListItemRefCandidateKeys(ref)) {
    if (key in items) {
      return items[key];
    }
  }
  return undefined;
};

export const hasListItemByRef = (
  items: ListItemsMap<unknown> | undefined,
  ref: Partial<ListItemRef> | null | undefined
): boolean => findListItemByRef(items, ref) !== undefined;

export const getListItemFromMap = <T>(
  items: ListItemsMap<T> | undefined,
  mediaType: ListItemMediaType,
  mediaId: number
): T | undefined => findListItemByRef(items, { id: mediaId, media_type: mediaType });

export const hasExistingListItem = (
  items: ListItemsMap<unknown> | undefined,
  mediaType: ListItemMediaType,
  mediaId: number
): boolean => getListItemFromMap(items, mediaType, mediaId) !== undefined;
