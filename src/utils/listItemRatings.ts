import type { ListMediaItem, UserList } from '@/src/services/ListService';
import { getListItemKey } from '@/src/utils/listItemKeys';

/**
 * Keeping the TMDB rating saved on list entries up to date.
 *
 * A list entry stores TMDB's `vote_average` from when it was added, and lists show that copy.
 * A new title's rating moves a lot in its first months, so the saved copy drifts from what its
 * details page shows. These helpers decide when a saved rating is out of date and which titles
 * a list should check.
 */

/** Titles released (or releasing) within this many days of today are checked from their list. */
export const LIST_RATING_RECENT_WINDOW_DAYS = 180;
/** At most this many titles are looked up per list check. */
export const MAX_LIST_RATING_LOOKUPS = 20;
/** A list is checked at most once per this interval. */
export const LIST_RATING_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Media types whose list entries carry the title's own TMDB rating. */
export type RatedListMediaType = 'movie' | 'tv';

/** The rating as the app shows it: one decimal place. */
export const toDisplayedRating = (value: number): string => value.toFixed(1);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * The TMDB rating to save over a stored one, or null to keep the stored one. A rating is only
 * replaced when the app would show a different value, so small TMDB changes cost no writes.
 *
 * - An entry without a stored rating is left alone: the server fills it in with the rest of
 *   the title's details, and treats a missing rating as "not filled in yet".
 * - A rating is never replaced with 0 (no votes): TMDB doesn't take votes back, so 0 for a
 *   rated title is a glitch. 0 is replaced once a title gets votes.
 */
export const getListRatingUpdate = (stored: unknown, fresh: unknown): number | null => {
  if (!isFiniteNumber(stored) || !isFiniteNumber(fresh) || fresh <= 0) {
    return null;
  }
  return toDisplayedRating(stored) === toDisplayedRating(fresh) ? null : fresh;
};

/** One saved list entry whose rating may need updating, located where it is stored. */
export interface ListRatingTarget {
  listId: string;
  /** The entry's key in the cached list (normalized, e.g. `movie-123`). */
  itemKey: string;
  /** The key the entry is stored under in Firestore (a legacy entry uses its numeric id). */
  storedKey: string;
  /** Overflow page holding the entry; 0 is the list document. */
  page: number;
  mediaType: RatedListMediaType;
  mediaId: number;
  /** The rating saved on the entry. */
  storedRating: number;
}

/**
 * Where an entry of `list` is stored, or null when it can't be told. Lists cached before stored
 * keys were tracked can't say whether an entry lives under a legacy key, and a write by field
 * path to the wrong key would create a stray entry, so they are left alone until next loaded.
 */
const locateEntry = (
  list: UserList,
  itemKey: string
): { storedKey: string; page: number } | null => {
  if (!list.storedItemKeys) {
    return null;
  }
  const storedKey = list.storedItemKeys[itemKey] ?? itemKey;
  return { storedKey, page: list.overflowItemPages?.[storedKey] ?? 0 };
};

const isRatedMediaType = (value: unknown): value is RatedListMediaType =>
  value === 'movie' || value === 'tv';

/** The entry as a rating target, or null when it has no rating to keep up to date. */
const toRatingTarget = (
  list: UserList,
  itemKey: string,
  item: ListMediaItem | undefined
): ListRatingTarget | null => {
  if (
    !item ||
    typeof item.id !== 'number' ||
    !isRatedMediaType(item.media_type) ||
    !isFiniteNumber(item.vote_average)
  ) {
    return null;
  }
  const location = locateEntry(list, itemKey);
  if (!location) {
    return null;
  }
  return {
    listId: list.id,
    itemKey,
    ...location,
    mediaType: item.media_type,
    mediaId: item.id,
    storedRating: item.vote_average,
  };
};

/** Every saved copy of a movie or show across the lists, with the rating each one stores. */
export const getListRatingTargets = (
  lists: UserList[],
  mediaType: RatedListMediaType,
  mediaId: number
): ListRatingTarget[] => {
  const itemKey = getListItemKey({ id: mediaId, media_type: mediaType });
  if (!itemKey) {
    return [];
  }
  return lists.flatMap((list) => {
    const target = toRatingTarget(list, itemKey, list.items?.[itemKey]);
    return target ? [target] : [];
  });
};

/** The day a title came out (or comes out), in milliseconds; null when it has no usable date. */
const getReleaseMillis = (item: ListMediaItem): number | null => {
  const date =
    item.media_type === 'tv' ? item.first_air_date || item.release_date : item.release_date;
  if (typeof date !== 'string' || date.trim() === '') {
    return null;
  }
  const millis = Date.parse(date);
  return Number.isNaN(millis) ? null : millis;
};

/**
 * The titles of `list` whose rating a list check looks up: movies and shows with a stored
 * rating that came out within the recent window or haven't come out yet, closest to `now`
 * first (a rating moves most around release), at most `MAX_LIST_RATING_LOOKUPS`. Older titles
 * hardly change, and titles without a date can't be placed.
 */
export const getListRatingCandidates = (list: UserList, now: number): ListRatingTarget[] => {
  const windowStart = now - LIST_RATING_RECENT_WINDOW_DAYS * DAY_MS;
  return Object.entries(list.items ?? {})
    .flatMap(([itemKey, item]) => {
      const releaseMillis = item ? getReleaseMillis(item) : null;
      if (releaseMillis === null || releaseMillis < windowStart) {
        return [];
      }
      const target = toRatingTarget(list, itemKey, item);
      return target ? [{ target, distance: Math.abs(releaseMillis - now) }] : [];
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_LIST_RATING_LOOKUPS)
    .map(({ target }) => target);
};

/** A movie or show's key in the session's fresh ratings. */
export const getRatedMediaKey = (mediaType: RatedListMediaType, mediaId: number): string =>
  `${mediaType}-${mediaId}`;

/** TMDB ratings fetched this session, shared by details pages and list checks. */
const sessionRatings = new Map<string, number>();

export const rememberFreshRating = (
  mediaType: RatedListMediaType,
  mediaId: number,
  rating: number
): void => {
  if (isFiniteNumber(rating)) {
    sessionRatings.set(getRatedMediaKey(mediaType, mediaId), rating);
  }
};

export const getFreshRating = (
  mediaType: RatedListMediaType,
  mediaId: number
): number | undefined => sessionRatings.get(getRatedMediaKey(mediaType, mediaId));

/** For tests: forget the ratings fetched this session. */
export const resetFreshRatingsForTests = (): void => {
  sessionRatings.clear();
};

/** Saved ratings by list id, then by the entry's cached (normalized) key. */
export type SavedListRatings = Map<string, Map<string, number>>;

/**
 * The cached lists with the saved ratings applied, keeping every list and entry that didn't
 * change as it was (so nothing re-renders for them).
 */
export const applySavedListRatings = (
  lists: UserList[] | undefined,
  saved: SavedListRatings
): UserList[] | undefined =>
  lists?.map((list) => {
    const ratings = saved.get(list.id);
    if (!ratings) {
      return list;
    }
    let items: Record<string, ListMediaItem> | null = null;
    ratings.forEach((rating, itemKey) => {
      const item = list.items?.[itemKey];
      if (item && item.vote_average !== rating) {
        items ??= { ...list.items };
        items[itemKey] = { ...item, vote_average: rating };
      }
    });
    return items ? { ...list, items } : list;
  });
