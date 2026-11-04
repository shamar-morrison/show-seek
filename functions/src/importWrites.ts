/**
 * Shared TMDB lookups and Firestore writes for the chunked import callables
 * (IMDb, TV Time). Server-only: unlike `shared/`, nothing here is imported by the app.
 */
import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { buildListItemKey, getLegacyListItemKey, hasExistingListItem } from './shared/listItemKeys';

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_REQUEST_TIMEOUT_MS = 15_000;
const TMDB_MAX_RATE_LIMIT_RETRIES = 3;

export const DEFAULT_LIST_NAMES = {
  alreadyWatched: 'Already Watched',
  currentlyWatching: 'Watching',
  dropped: 'Dropped',
  favorites: 'Favorites',
  watchlist: 'Should Watch',
} as const;

export const DEFAULT_LIST_IDS = new Set([
  'already-watched',
  'currently-watching',
  'dropped',
  'favorites',
  'watchlist',
]);

export interface TmdbMovieResult {
  genre_ids?: number[];
  id: number;
  poster_path: string | null;
  release_date?: string;
  title: string;
  vote_average?: number;
}

export interface TmdbTvResult {
  first_air_date?: string;
  genre_ids?: number[];
  id: number;
  name: string;
  poster_path: string | null;
  vote_average?: number;
}

export interface TmdbEpisodeResult {
  air_date?: string | null;
  episode_number: number;
  id: number;
  name: string;
  season_number: number;
  show_id: number;
}

export interface TmdbFindResponse {
  movie_results?: TmdbMovieResult[];
  person_results?: Record<string, unknown>[];
  tv_episode_results?: TmdbEpisodeResult[];
  tv_results?: TmdbTvResult[];
}

export interface TmdbTvDetails {
  first_air_date?: string;
  genre_ids?: number[];
  id: number;
  name: string;
  poster_path: string | null;
  status?: string;
  vote_average?: number;
}

export type ResolvedListMedia =
  | { kind: 'movie'; value: TmdbMovieResult }
  | { kind: 'tv'; value: TmdbTvResult };

export interface CachedListRecord {
  data: FirebaseFirestore.DocumentData | null;
  id: string;
  name: string;
  ref: FirebaseFirestore.DocumentReference;
}

export interface ImportWriteContext {
  db: FirebaseFirestore.Firestore;
  listCache: Map<string, CachedListRecord>;
  listNameCache: Map<string, string>;
  userId: string;
}

interface UserDocData {
  premium?: {
    isPremium?: boolean;
  };
}

/** Rejects unauthenticated and anonymous callers; returns the caller's uid. */
export function requireSignedInUser(auth: { token?: unknown; uid?: string } | undefined): string {
  const token = auth?.token as
    | { firebase?: { sign_in_provider?: string }; sign_in_provider?: string }
    | undefined;
  const signInProvider = token?.firebase?.sign_in_provider ?? token?.sign_in_provider;
  const userId = auth?.uid;

  if (!userId || signInProvider === 'anonymous') {
    throw new HttpsError('unauthenticated', 'Please sign in to continue.');
  }

  return userId;
}

export async function assertPremiumUser(
  db: FirebaseFirestore.Firestore,
  userId: string,
  message: string
): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data() as UserDocData | undefined;

  if (!userData?.premium?.isPremium) {
    throw new HttpsError('permission-denied', message);
  }
}

export async function createImportWriteContext(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<ImportWriteContext> {
  const listCache = await loadUserListCache(db, userId);
  const listNameCache = new Map<string, string>();
  listCache.forEach((record) => {
    if (DEFAULT_LIST_IDS.has(record.id)) {
      return;
    }
    listNameCache.set(record.name.toLowerCase(), record.id);
  });

  return { db, listCache, listNameCache, userId };
}

async function loadUserListCache(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<Map<string, CachedListRecord>> {
  const snapshot = await db.collection('users').doc(userId).collection('lists').get();
  const listCache = new Map<string, CachedListRecord>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    listCache.set(doc.id, {
      data,
      id: doc.id,
      name: String(data.name ?? doc.id),
      ref: doc.ref,
    });
  });

  return listCache;
}

export const normalizeListIdBase = (listName: string): string =>
  listName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'imported-list';

export async function ensureCustomList(
  context: ImportWriteContext,
  listName: string
): Promise<{ created: boolean; listId: string }> {
  const normalizedName = listName.trim().toLowerCase();
  const existingId = context.listNameCache.get(normalizedName);

  if (existingId) {
    return { created: false, listId: existingId };
  }

  const baseId = normalizeListIdBase(listName);
  let nextId = baseId;
  let attempt = 0;

  while (DEFAULT_LIST_IDS.has(nextId) || context.listCache.has(nextId)) {
    attempt += 1;
    nextId = `${baseId}-${attempt}`;
  }

  const ref = context.db.collection('users').doc(context.userId).collection('lists').doc(nextId);
  await ref.set({
    createdAt: Date.now(),
    isCustom: true,
    items: {},
    name: listName,
  });

  context.listCache.set(nextId, {
    data: {
      createdAt: Date.now(),
      isCustom: true,
      items: {},
      name: listName,
    },
    id: nextId,
    name: listName,
    ref,
  });
  context.listNameCache.set(normalizedName, nextId);

  return { created: true, listId: nextId };
}

/** Adds a movie/show to a list. Never replaces an existing membership; returns whether it wrote. */
export async function upsertListMembership(
  context: ImportWriteContext,
  listId: string,
  listName: string,
  addedAt: number,
  resolvedResult: ResolvedListMedia
): Promise<boolean> {
  const existingRecord = context.listCache.get(listId);
  const ref =
    existingRecord?.ref ??
    context.db.collection('users').doc(context.userId).collection('lists').doc(listId);
  const existingData = existingRecord?.data ?? null;
  const existingItems = (existingData?.items ?? {}) as Record<string, unknown>;
  const mediaType = resolvedResult.kind === 'movie' ? 'movie' : 'tv';
  const itemKey = buildListItemKey(mediaType, resolvedResult.value.id);
  const legacyItemKey = getLegacyListItemKey(resolvedResult.value.id);

  if (hasExistingListItem(existingItems, mediaType, resolvedResult.value.id)) {
    return false;
  }

  const basePayload =
    resolvedResult.kind === 'movie'
      ? {
          addedAt,
          genre_ids: resolvedResult.value.genre_ids,
          id: resolvedResult.value.id,
          media_type: mediaType,
          poster_path: resolvedResult.value.poster_path ?? null,
          release_date: resolvedResult.value.release_date ?? '',
          title: resolvedResult.value.title,
          vote_average: resolvedResult.value.vote_average ?? 0,
        }
      : {
          addedAt,
          first_air_date: resolvedResult.value.first_air_date ?? '',
          genre_ids: resolvedResult.value.genre_ids,
          id: resolvedResult.value.id,
          media_type: mediaType,
          name: resolvedResult.value.name,
          poster_path: resolvedResult.value.poster_path ?? null,
          release_date: resolvedResult.value.first_air_date ?? '',
          title: resolvedResult.value.name,
          vote_average: resolvedResult.value.vote_average ?? 0,
        };

  await ref.set(
    {
      createdAt: existingData?.createdAt ?? Date.now(),
      items: {
        [legacyItemKey]: FieldValue.delete(),
        [itemKey]: removeUndefined(basePayload),
      },
      name: existingData?.name ?? listName,
      updatedAt: Date.now(),
    },
    { merge: true }
  );

  const nextItems = {
    ...(existingItems ?? {}),
    [itemKey]: removeUndefined(basePayload),
  } as Record<string, unknown>;
  delete nextItems[legacyItemKey];

  context.listCache.set(listId, {
    data: {
      ...(existingData ?? {}),
      createdAt: existingData?.createdAt ?? Date.now(),
      items: nextItems,
      name: existingData?.name ?? listName,
      updatedAt: Date.now(),
    },
    id: listId,
    name: existingData?.name ?? listName,
    ref,
  });

  return true;
}

/**
 * 'newer': replace an existing rating only when the incoming one is more recent (IMDb).
 * 'never': leave any existing rating untouched (TV Time).
 */
export type RatingConflictPolicy = 'newer' | 'never';

export async function upsertMovieOrTvRating(
  context: ImportWriteContext,
  resolved: ResolvedListMedia,
  rating: { ratedAt: number; rating: number },
  policy: RatingConflictPolicy
): Promise<boolean> {
  const mediaType = resolved.kind;
  const mediaId = String(resolved.value.id);
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('ratings')
    .doc(`${mediaType}-${mediaId}`);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    if (policy === 'never') {
      return false;
    }

    const existingData = snapshot.data() ?? {};
    if (typeof existingData.ratedAt === 'number' && existingData.ratedAt >= rating.ratedAt) {
      return false;
    }
  }

  await ref.set(
    {
      id: mediaId,
      mediaType,
      posterPath: resolved.value.poster_path ?? null,
      ratedAt: rating.ratedAt,
      rating: rating.rating,
      releaseDate:
        resolved.kind === 'movie'
          ? (resolved.value.release_date ?? null)
          : (resolved.value.first_air_date ?? null),
      title: resolved.kind === 'movie' ? resolved.value.title : resolved.value.name,
    },
    { merge: false }
  );

  return true;
}

/** Writes one deterministic watch doc; a re-run with the same id is a no-op. */
export async function upsertMovieWatch(
  context: ImportWriteContext,
  movieId: number,
  watchDocId: string,
  watchedAt: number
): Promise<boolean> {
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('watched_movies')
    .doc(String(movieId))
    .collection('watches')
    .doc(watchDocId);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return false;
  }

  await ref.set({
    movieId,
    watchedAt: admin.firestore.Timestamp.fromMillis(watchedAt),
  });
  return true;
}

export async function requestTmdb<T>(path: string, apiKey: string): Promise<T> {
  return (await fetchTmdb<T>(path, apiKey, false, 0)) as T;
}

/** Same as `requestTmdb`, but resolves to null on a 404 instead of throwing. */
export async function requestTmdbOrNull<T>(path: string, apiKey: string): Promise<T | null> {
  return fetchTmdb<T>(path, apiKey, true, 0);
}

async function fetchTmdb<T>(
  path: string,
  apiKey: string,
  allowNotFound: boolean,
  attempt: number
): Promise<T | null> {
  const separator = path.includes('?') ? '&' : '?';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, TMDB_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${TMDB_BASE_URL}${path}${separator}api_key=${encodeURIComponent(apiKey)}`,
      {
        signal: controller.signal,
      }
    );

    if (response.status === 429 && attempt < TMDB_MAX_RATE_LIMIT_RETRIES) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 0);
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      clearTimeout(timeoutId);
      await wait(delayMs);
      return fetchTmdb<T>(path, apiKey, allowNotFound, attempt + 1);
    }

    if (allowNotFound && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new HttpsError('internal', `TMDB request failed with status ${response.status}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (isAbortError(error)) {
      throw new HttpsError('unavailable', 'TMDB request timed out');
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined)
  ) as Partial<T>;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'AbortError')
  );
}
