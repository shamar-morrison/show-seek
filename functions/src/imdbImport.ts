import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import {
  IMDB_IMPORT_CHUNK_SIZE,
  IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK,
  createEmptyImdbImportStats,
  incrementImportStat,
  type ImdbImportAction,
  type ImdbImportChunkResult,
  type ImdbImportEntity,
  type ImdbImportSkipReason,
  type ImdbImportStats,
} from './shared/imdbImport';
import {
  buildListItemKey,
  getLegacyListItemKey,
  hasExistingListItem,
} from './shared/listItemKeys';

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LIST_NAMES = {
  alreadyWatched: 'Already Watched',
  watchlist: 'Should Watch',
} as const;
const DEFAULT_LIST_IDS = new Set([
  'already-watched',
  'currently-watching',
  'dropped',
  'favorites',
  'watchlist',
]);

interface UserDocData {
  premium?: {
    isPremium?: boolean;
  };
}

interface TmdbMovieResult {
  genre_ids?: number[];
  id: number;
  poster_path: string | null;
  release_date?: string;
  title: string;
  vote_average?: number;
}

interface TmdbTvResult {
  first_air_date?: string;
  genre_ids?: number[];
  id: number;
  name: string;
  poster_path: string | null;
  vote_average?: number;
}

interface TmdbEpisodeResult {
  air_date?: string | null;
  episode_number: number;
  id: number;
  name: string;
  season_number: number;
  show_id: number;
}

interface TmdbFindResponse {
  movie_results?: TmdbMovieResult[];
  person_results?: Array<Record<string, unknown>>;
  tv_episode_results?: TmdbEpisodeResult[];
  tv_results?: TmdbTvResult[];
}

type ResolvedTmdbImportResult =
  | { kind: 'episode'; value: TmdbEpisodeResult }
  | { kind: 'movie'; value: TmdbMovieResult }
  | { kind: 'tv'; value: TmdbTvResult }
  | { kind: 'unsupported' }
  | { kind: 'unresolved' };

interface TmdbTvDetails {
  first_air_date?: string;
  genre_ids?: number[];
  id: number;
  name: string;
  poster_path: string | null;
  vote_average?: number;
}

interface CachedListRecord {
  data: FirebaseFirestore.DocumentData | null;
  id: string;
  name: string;
  ref: FirebaseFirestore.DocumentReference;
}

interface ImportContext {
  db: FirebaseFirestore.Firestore;
  listCache: Map<string, CachedListRecord>;
  listNameCache: Map<string, string>;
  showDetailsCache: Map<number, Promise<TmdbTvDetails>>;
  tmdbApiKey: string;
  userId: string;
}

export const importImdbChunk = onCall(
  {
    maxInstances: 1,
    memory: '512MiB',
    secrets: [TMDB_API_KEY],
    timeoutSeconds: 120,
  },
  async (request): Promise<ImdbImportChunkResult> => {
    const userId = request.auth?.uid;
    const signInProvider =
      (
        request.auth?.token as
          | {
              firebase?: {
                sign_in_provider?: string;
              };
              sign_in_provider?: string;
            }
          | undefined
      )?.firebase?.sign_in_provider ??
      (
        request.auth?.token as
          | {
              firebase?: {
                sign_in_provider?: string;
              };
              sign_in_provider?: string;
            }
          | undefined
      )?.sign_in_provider;
    if (!userId || signInProvider === 'anonymous') {
      throw new HttpsError('unauthenticated', 'Please sign in to continue.');
    }

    const rawEntities = request.data?.entities;
    if (!Array.isArray(rawEntities)) {
      throw new HttpsError('invalid-argument', 'entities must be an array.');
    }

    if (rawEntities.length > IMDB_IMPORT_CHUNK_SIZE) {
      throw new HttpsError('invalid-argument', 'Chunk size exceeds the supported maximum.');
    }

    const entities = parseImdbImportEntities(rawEntities);
    const db = admin.firestore();
    await assertPremiumUser(db, userId);

    const tmdbApiKey = TMDB_API_KEY.value().trim();
    if (!tmdbApiKey) {
      throw new HttpsError('failed-precondition', 'TMDB import is not configured.');
    }

    const listCache = await loadUserListCache(db, userId);
    const listNameCache = new Map<string, string>();
    listCache.forEach((record) => {
      if (DEFAULT_LIST_IDS.has(record.id)) {
        return;
      }
      listNameCache.set(record.name.toLowerCase(), record.id);
    });

    const context: ImportContext = {
      db,
      listCache,
      listNameCache,
      showDetailsCache: new Map<number, Promise<TmdbTvDetails>>(),
      tmdbApiKey,
      userId,
    };

    const stats = createEmptyImdbImportStats();
    stats.processedEntities = entities.length;
    stats.processedActions = entities.reduce((total, entity) => total + entity.actions.length, 0);

    for (const entity of entities) {
      const resolvedResult = await resolveImportResult(entity.imdbId, tmdbApiKey);

      if (resolvedResult.kind === 'unresolved') {
        entity.actions.forEach(() => incrementSkipped(stats, 'unresolved_imdb_id'));
        continue;
      }

      if (resolvedResult.kind === 'unsupported') {
        entity.actions.forEach(() => incrementSkipped(stats, 'unsupported_tmdb_result'));
        continue;
      }

      for (const action of entity.actions) {
        await applyImportAction(context, stats, action, resolvedResult);
      }
    }

    console.info('[imdbImport] chunk complete', {
      imported: stats.imported,
      processedActions: stats.processedActions,
      processedEntities: stats.processedEntities,
      skipped: stats.skipped,
      userIdSuffix: userId.slice(-6),
    });

    return stats;
  }
);

function parseImdbImportEntities(rawEntities: unknown[]): ImdbImportEntity[] {
  let totalActionCount = 0;

  return rawEntities.map((rawEntity, entityIndex) => {
    const entityPath = `entities[${entityIndex}]`;
    const entity = parseObject(rawEntity, entityPath);
    const imdbId = parseNonEmptyString(entity.imdbId, `${entityPath}.imdbId`);

    if (!Array.isArray(entity.actions)) {
      throw new HttpsError('invalid-argument', `${entityPath}.actions must be an array.`);
    }

    totalActionCount += entity.actions.length;
    if (totalActionCount > IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK) {
      throw new HttpsError(
        'invalid-argument',
        `${entityPath}.actions causes the chunk to exceed the supported maximum of ${IMDB_IMPORT_MAX_ACTIONS_PER_CHUNK} actions.`
      );
    }

    return {
      actions: entity.actions.map((rawAction, actionIndex) =>
        parseImdbImportAction(rawAction, `${entityPath}.actions[${actionIndex}]`)
      ),
      imdbId,
      rawTitleType: typeof entity.rawTitleType === 'string' ? entity.rawTitleType : null,
      title: typeof entity.title === 'string' ? entity.title : '',
    };
  });
}

function parseImdbImportAction(rawAction: unknown, actionPath: string): ImdbImportAction {
  const action = parseObject(rawAction, actionPath);
  const sourceFileName = typeof action.sourceFileName === 'string' ? action.sourceFileName : '';

  switch (action.kind) {
    case 'rating':
      return {
        kind: 'rating',
        ratedAt: parseFiniteNumber(action.ratedAt, `${actionPath}.ratedAt`),
        rating: parseIntegerInRange(action.rating, `${actionPath}.rating`, 1, 10),
        sourceFileName,
      };
    case 'list':
      return {
        addedAt: parseFiniteNumber(action.addedAt, `${actionPath}.addedAt`),
        isWatchlist: parseBoolean(action.isWatchlist, `${actionPath}.isWatchlist`),
        kind: 'list',
        listName: parseNonEmptyString(action.listName, `${actionPath}.listName`),
        sourceFileName,
      };
    case 'checkin':
      return {
        kind: 'checkin',
        sourceFileName,
        watchedAt: parseFiniteNumber(action.watchedAt, `${actionPath}.watchedAt`),
      };
    default:
      throw new HttpsError(
        'invalid-argument',
        `${actionPath}.kind must be one of rating, list, checkin.`
      );
  }
}

export const buildImportedMovieWatchDocId = (tmdbMovieId: string, watchedAt: number): string =>
  `imdb-${tmdbMovieId}-${watchedAt}`;

export const normalizeListIdBase = (listName: string): string =>
  listName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'imported-list';

export const resolveTmdbImportResult = (payload: TmdbFindResponse): ResolvedTmdbImportResult => {
  if ((payload.tv_episode_results?.length ?? 0) > 0) {
    return {
      kind: 'episode',
      value: payload.tv_episode_results![0],
    };
  }

  if ((payload.movie_results?.length ?? 0) > 0) {
    return {
      kind: 'movie',
      value: payload.movie_results![0],
    };
  }

  if ((payload.tv_results?.length ?? 0) > 0) {
    return {
      kind: 'tv',
      value: payload.tv_results![0],
    };
  }

  if ((payload.person_results?.length ?? 0) > 0) {
    return { kind: 'unsupported' };
  }

  return { kind: 'unresolved' };
};

async function applyImportAction(
  context: ImportContext,
  stats: ImdbImportStats,
  action: ImdbImportAction,
  resolvedResult: Extract<ResolvedTmdbImportResult, { kind: 'movie' | 'tv' | 'episode' }>
): Promise<void> {
  switch (action.kind) {
    case 'rating':
      if (resolvedResult.kind === 'movie') {
        const didWrite = await upsertMovieOrTvRating(context, resolvedResult.value, action, 'movie');
        if (didWrite) {
          stats.imported.ratings += 1;
        }
        return;
      }

      if (resolvedResult.kind === 'tv') {
        const didWrite = await upsertMovieOrTvRating(context, resolvedResult.value, action, 'tv');
        if (didWrite) {
          stats.imported.ratings += 1;
        }
        return;
      }

      {
        const didWrite = await upsertEpisodeRating(context, resolvedResult.value, action);
        if (didWrite) {
          stats.imported.ratings += 1;
        }
      }
      return;
    case 'list':
      if (resolvedResult.kind === 'episode') {
        incrementSkipped(stats, 'unsupported_list_episode');
        return;
      }

      {
        if (!action.isWatchlist) {
          const customListResult = await ensureCustomList(context, action.listName);
          if (customListResult.created) {
            stats.imported.customListsCreated += 1;
          }
          const didWrite = await upsertListMembership(
            context,
            customListResult.listId,
            action.listName,
            action.addedAt,
            resolvedResult
          );
          if (didWrite) {
            stats.imported.listItems += 1;
          }
          return;
        }

        const didWrite = await upsertListMembership(
          context,
          'watchlist',
          DEFAULT_LIST_NAMES.watchlist,
          action.addedAt,
          resolvedResult
        );
        if (didWrite) {
          stats.imported.listItems += 1;
        }
      }
      return;
    case 'checkin':
      if (resolvedResult.kind === 'movie') {
        const didWriteWatch = await upsertMovieWatch(context, resolvedResult.value, action);
        if (didWriteWatch) {
          stats.imported.watchedMovies += 1;
        }
        await ensureAlreadyWatchedMembership(context, resolvedResult, action.watchedAt);
        return;
      }

      if (resolvedResult.kind === 'tv') {
        const didAddMembership = await ensureAlreadyWatchedMembership(
          context,
          resolvedResult,
          action.watchedAt
        );
        if (didAddMembership) {
          stats.imported.watchedShows += 1;
        }
        return;
      }

      {
        const didWrite = await upsertEpisodeWatch(context, resolvedResult.value, action);
        if (didWrite) {
          stats.imported.watchedEpisodes += 1;
        }
      }
      return;
  }
}

async function assertPremiumUser(
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<void> {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data() as UserDocData | undefined;

  if (!userData?.premium?.isPremium) {
    throw new HttpsError('permission-denied', 'IMDb import requires Premium.');
  }
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

async function ensureCustomList(
  context: ImportContext,
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

async function upsertListMembership(
  context: ImportContext,
  listId: string,
  listName: string,
  addedAt: number,
  resolvedResult: Extract<ResolvedTmdbImportResult, { kind: 'movie' | 'tv' }>
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

async function ensureAlreadyWatchedMembership(
  context: ImportContext,
  resolvedResult: Extract<ResolvedTmdbImportResult, { kind: 'movie' | 'tv' }>,
  addedAt: number
): Promise<boolean> {
  return upsertListMembership(
    context,
    'already-watched',
    DEFAULT_LIST_NAMES.alreadyWatched,
    addedAt,
    resolvedResult
  );
}

async function upsertMovieOrTvRating(
  context: ImportContext,
  value: TmdbMovieResult | TmdbTvResult,
  action: Extract<ImdbImportAction, { kind: 'rating' }>,
  mediaType: 'movie' | 'tv'
): Promise<boolean> {
  const mediaId = String(value.id);
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('ratings')
    .doc(`${mediaType}-${mediaId}`);
  const snapshot = await ref.get();
  const existingData = snapshot.data() ?? {};

  if (typeof existingData.ratedAt === 'number' && existingData.ratedAt >= action.ratedAt) {
    return false;
  }

  await ref.set(
    {
      id: mediaId,
      mediaType,
      posterPath: value.poster_path ?? null,
      ratedAt: action.ratedAt,
      rating: action.rating,
      releaseDate:
        mediaType === 'movie'
          ? (value as TmdbMovieResult).release_date ?? null
          : (value as TmdbTvResult).first_air_date ?? null,
      title: mediaType === 'movie' ? (value as TmdbMovieResult).title : (value as TmdbTvResult).name,
    },
    { merge: false }
  );

  return true;
}

async function upsertEpisodeRating(
  context: ImportContext,
  value: TmdbEpisodeResult,
  action: Extract<ImdbImportAction, { kind: 'rating' }>
): Promise<boolean> {
  const showDetails = await getShowDetails(context, value.show_id);
  const docId = `episode-${value.show_id}-${value.season_number}-${value.episode_number}`;
  const ref = context.db.collection('users').doc(context.userId).collection('ratings').doc(docId);
  const snapshot = await ref.get();
  const existingData = snapshot.data() ?? {};

  if (typeof existingData.ratedAt === 'number' && existingData.ratedAt >= action.ratedAt) {
    return false;
  }

  await ref.set(
    {
      episodeName: value.name,
      episodeNumber: value.episode_number,
      id: docId,
      mediaType: 'episode',
      posterPath: showDetails.poster_path ?? null,
      ratedAt: action.ratedAt,
      rating: action.rating,
      seasonNumber: value.season_number,
      tvShowId: value.show_id,
      tvShowName: showDetails.name,
    },
    { merge: false }
  );

  return true;
}

async function upsertMovieWatch(
  context: ImportContext,
  value: TmdbMovieResult,
  action: Extract<ImdbImportAction, { kind: 'checkin' }>
): Promise<boolean> {
  const watchDocId = buildImportedMovieWatchDocId(String(value.id), action.watchedAt);
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('watched_movies')
    .doc(String(value.id))
    .collection('watches')
    .doc(watchDocId);
  const snapshot = await ref.get();

  if (snapshot.exists) {
    return false;
  }

  await ref.set({
    movieId: value.id,
    watchedAt: admin.firestore.Timestamp.fromMillis(action.watchedAt),
  });
  return true;
}

async function upsertEpisodeWatch(
  context: ImportContext,
  value: TmdbEpisodeResult,
  action: Extract<ImdbImportAction, { kind: 'checkin' }>
): Promise<boolean> {
  const showDetails = await getShowDetails(context, value.show_id);
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('episode_tracking')
    .doc(String(value.show_id));
  const snapshot = await ref.get();
  const existingData = snapshot.data() ?? {};
  const episodeKey = `${value.season_number}_${value.episode_number}`;
  const existingEpisode = existingData.episodes?.[episodeKey];

  if (
    existingEpisode &&
    typeof existingEpisode.watchedAt === 'number' &&
    existingEpisode.watchedAt >= action.watchedAt
  ) {
    return false;
  }

  const nextEpisode = {
    episodeAirDate: value.air_date ?? null,
    episodeId: value.id,
    episodeName: value.name,
    episodeNumber: value.episode_number,
    seasonNumber: value.season_number,
    tvShowId: value.show_id,
    watchedAt: action.watchedAt,
  };

  await ref.set(
    {
      episodes: {
        [episodeKey]: nextEpisode,
      },
      metadata: {
        lastUpdated: Math.max(action.watchedAt, Date.now()),
        posterPath: showDetails.poster_path ?? null,
        tvShowName: showDetails.name,
      },
    },
    { merge: true }
  );

  return true;
}

async function getShowDetails(context: ImportContext, showId: number): Promise<TmdbTvDetails> {
  if (!context.showDetailsCache.has(showId)) {
    context.showDetailsCache.set(
      showId,
      requestTmdb<TmdbTvDetails>(`/tv/${showId}`, context.tmdbApiKey)
    );
  }

  return context.showDetailsCache.get(showId)!;
}

async function resolveImportResult(
  imdbId: string,
  apiKey: string
): Promise<ResolvedTmdbImportResult> {
  const payload = await requestTmdb<TmdbFindResponse>(`/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`, apiKey);
  return resolveTmdbImportResult(payload);
}

async function requestTmdb<T>(path: string, apiKey: string, attempt = 0): Promise<T> {
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

    if (response.status === 429 && attempt < 3) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 0);
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      clearTimeout(timeoutId);
      await wait(delayMs);
      return requestTmdb<T>(path, apiKey, attempt + 1);
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

function incrementSkipped(stats: ImdbImportStats, key: ImdbImportSkipReason): void {
  stats.skipped = incrementImportStat(stats.skipped, key);
}

function parseObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${path} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function parseNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpsError('invalid-argument', `${path} must be a non-empty string.`);
  }

  return value.trim();
}

function parseFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new HttpsError('invalid-argument', `${path} must be a finite number.`);
  }

  return value;
}

function parseIntegerInRange(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be an integer between ${min} and ${max}.`
    );
  }

  return value;
}

function parseBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    throw new HttpsError('invalid-argument', `${path} must be a boolean.`);
  }

  return value;
}

function removeUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
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
