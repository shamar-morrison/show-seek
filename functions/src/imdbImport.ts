import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { commitEpisodeWrites, planEpisodeWrites, readEpisodeTracking } from './episodePagesAdmin';
import {
  DEFAULT_LIST_NAMES,
  assertPremiumUser,
  createImportWriteContext,
  ensureCustomList,
  requestTmdb,
  requireSignedInUser,
  upsertListMembership,
  upsertMovieOrTvRating,
  upsertMovieWatch,
  type ImportWriteContext,
  type ResolvedListMedia,
  type TmdbEpisodeResult,
  type TmdbFindResponse,
  type TmdbMovieResult,
  type TmdbTvDetails,
  type TmdbTvResult,
} from './importWrites';
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

export { normalizeListIdBase } from './importWrites';

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

type ResolvedTmdbImportResult =
  | { kind: 'episode'; value: TmdbEpisodeResult }
  | { kind: 'movie'; value: TmdbMovieResult }
  | { kind: 'tv'; value: TmdbTvResult }
  | { kind: 'unsupported' }
  | { kind: 'unresolved' };

interface ImportContext extends ImportWriteContext {
  showDetailsCache: Map<number, Promise<TmdbTvDetails>>;
  tmdbApiKey: string;
}

export const importImdbChunk = onCall(
  {
    maxInstances: 1,
    memory: '512MiB',
    secrets: [TMDB_API_KEY],
    timeoutSeconds: 120,
  },
  async (request): Promise<ImdbImportChunkResult> => {
    const userId = requireSignedInUser(request.auth);

    const rawEntities = request.data?.entities;
    if (!Array.isArray(rawEntities)) {
      throw new HttpsError('invalid-argument', 'entities must be an array.');
    }

    if (rawEntities.length > IMDB_IMPORT_CHUNK_SIZE) {
      throw new HttpsError('invalid-argument', 'Chunk size exceeds the supported maximum.');
    }

    const entities = parseImdbImportEntities(rawEntities);
    const db = admin.firestore();
    await assertPremiumUser(db, userId, 'IMDb import requires Premium.');

    const tmdbApiKey = TMDB_API_KEY.value().trim();
    if (!tmdbApiKey) {
      throw new HttpsError('failed-precondition', 'TMDB import is not configured.');
    }

    const context: ImportContext = {
      ...(await createImportWriteContext(db, userId)),
      showDetailsCache: new Map<number, Promise<TmdbTvDetails>>(),
      tmdbApiKey,
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
        const didWrite = await upsertMovieOrTvRating(context, resolvedResult, action, 'newer');
        if (didWrite) {
          stats.imported.ratings += 1;
        }
        return;
      }

      if (resolvedResult.kind === 'tv') {
        const didWrite = await upsertMovieOrTvRating(context, resolvedResult, action, 'newer');
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
      {
        // An episode is saved as its own entry: IMDb watchlist episodes go to Should Watch and
        // list episodes to the matching custom list, the only lists that take episodes.
        const listMedia: ResolvedListMedia =
          resolvedResult.kind === 'episode'
            ? {
                kind: 'episode',
                show: await getShowDetails(context, resolvedResult.value.show_id),
                value: resolvedResult.value,
              }
            : resolvedResult;

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
            listMedia
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
          listMedia
        );
        if (didWrite) {
          stats.imported.listItems += 1;
        }
      }
      return;
    case 'checkin':
      if (resolvedResult.kind === 'movie') {
        const didWriteWatch = await upsertMovieWatch(
          context,
          resolvedResult.value.id,
          buildImportedMovieWatchDocId(String(resolvedResult.value.id), action.watchedAt),
          action.watchedAt
        );
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
  // Includes episodes in overflow pages (very long shows).
  const tracking = await readEpisodeTracking(ref);
  const episodeKey = `${value.season_number}_${value.episode_number}`;
  const existingEpisode = tracking.items[episodeKey];

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

  await commitEpisodeWrites(
    context.db,
    tracking,
    planEpisodeWrites(tracking, { set: { [episodeKey]: nextEpisode } }),
    {
      metadata: {
        lastUpdated: Math.max(action.watchedAt, Date.now()),
        posterPath: showDetails.poster_path ?? null,
        tvShowName: showDetails.name,
      },
    }
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
  const payload = await requestTmdb<TmdbFindResponse>(
    `/find/${encodeURIComponent(imdbId)}?external_source=imdb_id`,
    apiKey
  );
  return resolveTmdbImportResult(payload);
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
