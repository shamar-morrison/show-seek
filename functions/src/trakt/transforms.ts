import { Timestamp } from 'firebase-admin/firestore';
import { buildListItemKey } from '../shared/listItemKeys';
import type {
  TraktActivitiesGroup,
  TraktFavorite,
  TraktListItem,
  TraktRating,
  TraktWatchedMovie,
  TraktWatchedShow,
  TraktWatchlistItem,
} from './types';

export const isListMediaType = (value: unknown): value is 'movie' | 'tv' => value === 'movie' || value === 'tv';

export const isTimestampLike = (value: unknown): value is { toMillis: () => number } =>
  typeof value === 'object' && value !== null && typeof (value as { toMillis?: unknown }).toMillis === 'function';

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const stripUndefinedDeep = (value: unknown, preserveEmptyObject = false): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item): item is Exclude<typeof item, undefined> => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitizedEntries = Object.entries(value)
    .map(([key, nestedValue]) => [key, stripUndefinedDeep(nestedValue)] as const)
    .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);

  if (sanitizedEntries.length === 0 && !preserveEmptyObject) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
};

export const areValuesEqual = (left: unknown, right: unknown): boolean => {
  if (isTimestampLike(left) && isTimestampLike(right)) {
    return left.toMillis() === right.toMillis();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => areValuesEqual(item, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  return Object.is(left, right);
};

export const hasManagedFieldChanges = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>
): boolean =>
  Object.entries(remoteValue).some(([key, value]) => !areValuesEqual(existingValue?.[key], value));

export const hasManagedFieldChangesIgnoringField = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>,
  ignoredField: string
): boolean =>
  Object.entries(remoteValue).some(
    ([key, value]) => key !== ignoredField && !areValuesEqual(existingValue?.[key], value)
  );

export const getComparableMillis = (value: unknown): number | null => {
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

  if (isTimestampLike(value)) {
    const millis = value.toMillis();
    return Number.isFinite(millis) ? millis : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof (value as { toDate?: unknown }).toDate === 'function'
  ) {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.getTime() : null;
  }

  return null;
};

export const shouldApplyRemoteManagedValue = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>,
  recencyField?: string
): boolean => {
  if (!existingValue) {
    return true;
  }

  if (!recencyField) {
    return hasManagedFieldChanges(existingValue, remoteValue);
  }

  const existingMillis = getComparableMillis(existingValue[recencyField]);
  const remoteMillis = getComparableMillis(remoteValue[recencyField]);

  if (remoteMillis !== null && (existingMillis === null || remoteMillis > existingMillis)) {
    return true;
  }

  if (remoteMillis !== null && existingMillis !== null && remoteMillis < existingMillis) {
    return false;
  }

  if (remoteMillis !== null && existingMillis !== null && remoteMillis === existingMillis) {
    return hasManagedFieldChangesIgnoringField(existingValue, remoteValue, recencyField);
  }

  return hasManagedFieldChanges(existingValue, remoteValue);
};

export const mergeManagedValue = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>
): Record<string, unknown> =>
  (stripUndefinedDeep(
    {
      ...(existingValue ?? {}),
      ...remoteValue,
    },
    true
  ) as Record<string, unknown>) ?? remoteValue;

export const normalizeStoredListItems = (
  items: Record<string, unknown> | undefined
): Record<string, Record<string, unknown>> => {
  if (!items || !isPlainObject(items)) {
    return {};
  }

  const normalized: Record<string, Record<string, unknown>> = {};
  const entries = Object.entries(items).filter((entry): entry is [string, Record<string, unknown>] =>
    isPlainObject(entry[1])
  );

  entries.forEach(([rawKey, rawValue]) => {
    const mediaType = rawValue.media_type;
    const mediaId = rawValue.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      if (!normalized[rawKey]) {
        normalized[rawKey] = rawValue;
      }
      return;
    }

    const normalizedKey = buildListItemKey(mediaType, mediaId);
    if (rawKey === normalizedKey) {
      normalized[normalizedKey] = rawValue;
    }
  });

  entries.forEach(([rawKey, rawValue]) => {
    const mediaType = rawValue.media_type;
    const mediaId = rawValue.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      if (!normalized[rawKey]) {
        normalized[rawKey] = rawValue;
      }
      return;
    }

    const normalizedKey = buildListItemKey(mediaType, mediaId);
    if (!normalized[normalizedKey]) {
      normalized[normalizedKey] = rawValue;
      return;
    }

    if (rawKey !== normalizedKey) {
      normalized[normalizedKey] = {
        ...rawValue,
        ...normalized[normalizedKey],
      };
    }
  });

  return normalized;
};

export const didActivityFieldChange = (
  previousGroup: TraktActivitiesGroup | undefined,
  nextGroup: TraktActivitiesGroup | undefined,
  field: keyof TraktActivitiesGroup
): boolean => (previousGroup?.[field] ?? null) !== (nextGroup?.[field] ?? null);

export const hasActivityGroupChanged = (
  previousGroup: TraktActivitiesGroup | undefined,
  nextGroup: TraktActivitiesGroup | undefined
): boolean => !areValuesEqual(previousGroup ?? {}, nextGroup ?? {});

export const normalizeChangedListIds = (listIds: string[]): string[] => Array.from(new Set(listIds.filter(Boolean)));

export const normalizeListIds = (listIds: string[]): string[] =>
  Array.from(new Set(listIds.map((item) => item.trim()).filter(Boolean)));

export const toFirestoreTimestamp = (value: string | null | undefined): FirebaseFirestore.Timestamp => {
  if (!value) {
    return Timestamp.now();
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return Timestamp.now();
  }
  return Timestamp.fromDate(date);
};

export const transformWatchedMovie = (traktMovie: TraktWatchedMovie): Record<string, unknown> | null => {
  if (!traktMovie?.movie?.ids?.tmdb) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: toFirestoreTimestamp(traktMovie.last_watched_at),
    id: traktMovie.movie.ids.tmdb,
    media_type: 'movie',
    release_date: traktMovie.movie.year ? `${traktMovie.movie.year}-01-01` : undefined,
    title: traktMovie.movie.title,
  }) as Record<string, unknown>;
};

export const transformWatchedShow = (traktShow: TraktWatchedShow): Record<string, unknown> | null => {
  if (!traktShow?.show?.ids?.tmdb) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: toFirestoreTimestamp(traktShow.last_watched_at),
    first_air_date: traktShow.show.year ? `${traktShow.show.year}-01-01` : undefined,
    id: traktShow.show.ids.tmdb,
    media_type: 'tv',
    name: traktShow.show.title,
  }) as Record<string, unknown>;
};

export const transformRating = (traktRating: TraktRating): Record<string, unknown> | null => {
  if (!traktRating) {
    return null;
  }

  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;

  if (traktRating.movie) {
    tmdbId = traktRating.movie.ids?.tmdb;
    mediaType = 'movie';
    title = traktRating.movie.title;
  } else if (traktRating.show) {
    tmdbId = traktRating.show.ids?.tmdb;
    mediaType = 'tv';
    title = traktRating.show.title;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return {
    docId: `${mediaType}-${tmdbId}`,
    id: String(tmdbId),
    mediaType,
    ratedAt: toFirestoreTimestamp(traktRating.rated_at),
    rating: traktRating.rating,
    title,
  };
};

export const transformListItem = (
  traktItem: TraktListItem
): { addedAt: FirebaseFirestore.Timestamp; mediaType: 'movie' | 'tv'; title: string; tmdbId: number; traktId?: number } | null => {
  if (!traktItem) {
    return null;
  }

  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;
  let traktId: number | undefined;

  if (traktItem.movie) {
    tmdbId = traktItem.movie.ids?.tmdb;
    mediaType = 'movie';
    title = traktItem.movie.title;
    traktId = traktItem.movie.ids?.trakt;
  } else if (traktItem.show) {
    tmdbId = traktItem.show.ids?.tmdb;
    mediaType = 'tv';
    title = traktItem.show.title;
    traktId = traktItem.show.ids?.trakt;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: toFirestoreTimestamp(traktItem.listed_at),
    mediaType,
    title,
    tmdbId,
    traktId,
  }) as {
    addedAt: FirebaseFirestore.Timestamp;
    mediaType: 'movie' | 'tv';
    title: string;
    tmdbId: number;
    traktId?: number;
  };
};

export const transformWatchlistItem = (traktItem: TraktWatchlistItem): Record<string, unknown> | null => {
  if (!traktItem) {
    return null;
  }

  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;
  let releaseDate: string | undefined;

  if (traktItem.movie) {
    tmdbId = traktItem.movie.ids?.tmdb;
    mediaType = 'movie';
    title = traktItem.movie.title;
    releaseDate = traktItem.movie.year ? `${traktItem.movie.year}-01-01` : undefined;
  } else if (traktItem.show) {
    tmdbId = traktItem.show.ids?.tmdb;
    mediaType = 'tv';
    title = traktItem.show.title;
    releaseDate = traktItem.show.year ? `${traktItem.show.year}-01-01` : undefined;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: toFirestoreTimestamp(traktItem.listed_at),
    id: tmdbId,
    media_type: mediaType,
    release_date: releaseDate,
    title,
  }) as Record<string, unknown>;
};

export const transformFavorite = (traktFavorite: TraktFavorite): Record<string, unknown> | null => {
  if (!traktFavorite) {
    return null;
  }

  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;

  if (traktFavorite.movie) {
    tmdbId = traktFavorite.movie.ids?.tmdb;
    mediaType = 'movie';
    title = traktFavorite.movie.title;
  } else if (traktFavorite.show) {
    tmdbId = traktFavorite.show.ids?.tmdb;
    mediaType = 'tv';
    title = traktFavorite.show.title;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return {
    addedAt: toFirestoreTimestamp(traktFavorite.listed_at),
    id: tmdbId,
    media_type: mediaType,
    title,
  };
};
