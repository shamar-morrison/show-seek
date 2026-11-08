/**
 * importTvTimeChunk — imports one chunk of a TV Time export that the app has
 * already parsed on-device. See docs/tvtime-import-plan.md.
 *
 * Per call: auth → validate → premium → rate-limit claim → resolve against TMDB
 * (concurrent, network only) → write to Firestore (sequential). Existing ShowSeek
 * data is never overwritten; every write is idempotent so chunks can be retried.
 */
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { planEpisodeWrites, readEpisodeTracking, stageEpisodeWrites } from './episodePagesAdmin';
import {
  DEFAULT_LIST_NAMES,
  assertPremiumUser,
  createImportWriteContext,
  ensureCustomList,
  removeUndefined,
  requestTmdb,
  requestTmdbOrNull,
  requireSignedInUser,
  upsertListMembership,
  upsertMovieOrTvRating,
  upsertMovieWatch,
  type ImportWriteContext,
  type ResolvedListMedia,
  type TmdbFindResponse,
  type TmdbMovieResult,
  type TmdbTvDetails,
  type TmdbTvResult,
} from './importWrites';
import {
  TEST_TVTIME_IMPORT_COOLDOWN_MS,
  TVTIME_IMPORT_COOLDOWN_MS,
  TVTIME_IMPORT_ID_PATTERN,
  TVTIME_IMPORT_MAX_CALLS_PER_MINUTE,
  TVTIME_IMPORT_MAX_CHUNKS_PER_SESSION,
  TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK,
  TVTIME_IMPORT_MAX_LISTS_PER_ENTITY,
  TVTIME_IMPORT_MAX_MOVIE_WATCHES,
  TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK,
  TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK,
  TVTIME_IMPORT_SESSION_MAX_LIFETIME_MS,
  TVTIME_IMPORT_SESSION_STALE_MS,
  createEmptyTvTimeImportStats,
  incrementTvTimeStat,
  type TvTimeEpisodePlay,
  type TvTimeIgnoredReason,
  type TvTimeImportChunkRequest,
  type TvTimeImportChunkResult,
  type TvTimeImportLimitDoc,
  type TvTimeImportStats,
  type TvTimeListMembership,
  type TvTimeMovieEntity,
  type TvTimeRateLimitDetails,
  type TvTimeRating,
  type TvTimeShowEntity,
  type TvTimeShowStatus,
  type TvTimeSkipReason,
} from './shared/tvtimeImport';
import { TRAKT_SYNC_BYPASS_UIDS_ENV } from './trakt/constants';

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

/** Parallel TMDB requests per call. With maxInstances 10 × concurrency 1 this caps the function at ~40 in flight. */
const TMDB_CONCURRENCY = 4;
/** Per-call budget for per-episode TVDB lookups used to repair numbering mismatches. */
const MAX_EPISODE_FALLBACK_LOOKUPS = 150;
/** TMDB allows at most 20 `append_to_response` entries per request. */
const MAX_APPENDED_SEASONS = 20;
const ENDED_SHOW_STATUSES = new Set(['Ended', 'Canceled']);
const MOVIE_WATCH_DOC_PREFIX = 'tvtime-';
const MAX_TITLE_LENGTH = 500;
const MAX_EPISODE_NUMBER = 10_000;

const MINUTE_MS = 60 * 1000;

const SHOW_STATUSES: readonly TvTimeShowStatus[] = [
  'watchlist',
  'watching',
  'up_to_date',
  'dropped',
];
const LIST_NAME_BY_ID: Record<string, string> = {
  'already-watched': DEFAULT_LIST_NAMES.alreadyWatched,
  'currently-watching': DEFAULT_LIST_NAMES.currentlyWatching,
  dropped: DEFAULT_LIST_NAMES.dropped,
  favorites: DEFAULT_LIST_NAMES.favorites,
  watchlist: DEFAULT_LIST_NAMES.watchlist,
};

interface TmdbSeasonEpisode {
  air_date?: string | null;
  episode_number: number;
  id: number;
  name: string;
  runtime?: number | null;
  season_number: number;
}

interface TmdbSeason {
  episodes?: TmdbSeasonEpisode[];
}

type TmdbTvDetailsWithSeasons = TmdbTvDetails & Record<string, unknown>;

interface TmdbSearchResponse<T> {
  results?: T[];
}

type TmdbTvSearchResult = TmdbTvResult & { original_name?: string };
type TmdbMovieSearchResult = TmdbMovieResult & { original_title?: string };
type TmdbMovieDetails = TmdbMovieResult & { genres?: { id: number }[] };

type SeasonIndex = Map<number, TmdbSeasonEpisode>;

interface TvTimeImportContext extends ImportWriteContext {
  tmdbApiKey: string;
  findCache: Map<string, Promise<TmdbFindResponse>>;
  detailsCache: Map<number, Promise<TmdbTvDetails | null>>;
  seasonCache: Map<string, Promise<SeasonIndex | null>>;
  fallbackLookupsRemaining: number;
}

interface MappedEpisode {
  episodeAirDate: string | null;
  episodeId: number;
  episodeName: string;
  episodeNumber: number;
  runtimeMinutes?: number;
  seasonNumber: number;
  tvShowId: number;
  watchedAt: number;
}

type TitleResolution<T> =
  | { kind: 'resolved'; value: T }
  | { kind: 'ambiguous' }
  | { kind: 'unresolved' };

type ShowResolution =
  | {
      kind: 'resolved';
      show: TmdbTvResult;
      episodes: Map<string, MappedEpisode>;
      rewatches: number;
      unmatched: number;
    }
  | { kind: 'ambiguous' }
  | { kind: 'unresolved' };

type MovieResolution = TitleResolution<TmdbMovieResult>;

export const importTvTimeChunk = onCall(
  {
    concurrency: 1,
    maxInstances: 10,
    memory: '512MiB',
    secrets: [TMDB_API_KEY],
    timeoutSeconds: 300,
  },
  async (request): Promise<TvTimeImportChunkResult> => {
    const userId = requireSignedInUser(request.auth);
    const payload = parseTvTimeImportChunk(request.data);
    const db = admin.firestore();
    await assertPremiumUser(db, userId, 'TV Time import requires Premium.');

    const tmdbApiKey = TMDB_API_KEY.value().trim();
    if (!tmdbApiKey) {
      throw new HttpsError('failed-precondition', 'TMDB import is not configured.');
    }

    await claimTvTimeChunkSlot(
      db,
      userId,
      payload.importId,
      Date.now(),
      isTvTimeCooldownBypassed(userId) ? TEST_TVTIME_IMPORT_COOLDOWN_MS : TVTIME_IMPORT_COOLDOWN_MS
    );

    const context: TvTimeImportContext = {
      ...(await createImportWriteContext(db, userId)),
      detailsCache: new Map(),
      fallbackLookupsRemaining: MAX_EPISODE_FALLBACK_LOOKUPS,
      findCache: new Map(),
      seasonCache: new Map(),
      tmdbApiKey,
    };

    const stats = createEmptyTvTimeImportStats();
    stats.processedEntities = payload.shows.length + payload.movies.length;

    // Phase 1: resolve against TMDB concurrently (network only, no writes).
    const showResolutions = await mapWithConcurrency(payload.shows, TMDB_CONCURRENCY, (show) =>
      resolveShow(context, show)
    );
    const movieResolutions = await mapWithConcurrency(payload.movies, TMDB_CONCURRENCY, (movie) =>
      resolveMovie(context, movie)
    );

    // Phase 2: write sequentially so list caches stay consistent.
    for (let index = 0; index < payload.shows.length; index += 1) {
      await writeShow(context, stats, payload.shows[index], showResolutions[index]);
    }
    for (let index = 0; index < payload.movies.length; index += 1) {
      await writeMovie(context, stats, payload.movies[index], movieResolutions[index]);
    }

    console.info('[tvtimeImport] chunk complete', {
      fallbackLookupsUsed: MAX_EPISODE_FALLBACK_LOOKUPS - context.fallbackLookupsRemaining,
      ignored: stats.ignored,
      imported: stats.imported,
      processedEntities: stats.processedEntities,
      skipped: stats.skipped,
      userIdSuffix: userId.slice(-6),
    });

    if (payload.final) {
      await markTvTimeImportFinished(db, userId, payload.importId, Date.now());
    }

    return stats;
  }
);

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Emulator and allowlisted testers get the short test cooldown, as in the Trakt ZIP import. */
export function isTvTimeCooldownBypassed(userId: string): boolean {
  if (process.env.FUNCTIONS_EMULATOR === 'true') {
    return true;
  }
  return (process.env[TRAKT_SYNC_BYPASS_UIDS_ENV] ?? '')
    .split(',')
    .map((value) => value.trim())
    .includes(userId);
}

/**
 * Reserves one chunk call for this user, or throws. Rules, in order:
 * 1. Burst: at most TVTIME_IMPORT_MAX_CALLS_PER_MINUTE calls in a rolling minute.
 * 2. Same importId (within its max lifetime) → continue that import.
 * 3. Different importId while the current import is still active (not finished, not stale) → `already-exists`.
 * 4. Different importId before the cooldown (measured from the last import's start) → `resource-exhausted`.
 * 5. Per-import chunk cap.
 *
 * Stored at users/{uid}/import_limits/tvtime: owner-readable, never client-writable,
 * and removed by account deletion's recursive delete of users/{uid}.
 */
export async function claimTvTimeChunkSlot(
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number,
  cooldownMs: number = TVTIME_IMPORT_COOLDOWN_MS
): Promise<void> {
  const ref = db.collection('users').doc(userId).collection('import_limits').doc('tvtime');

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = (snapshot.data() ?? {}) as Partial<TvTimeImportLimitDoc>;
    const recentCalls = (state.recentCalls ?? []).filter((at) => now - at < MINUTE_MS);

    if (recentCalls.length >= TVTIME_IMPORT_MAX_CALLS_PER_MINUTE) {
      throwRefused('burst', Math.min(...recentCalls) + MINUTE_MS - now);
    }

    const current = state.session;
    let session: TvTimeImportLimitDoc['session'];

    if (
      current &&
      current.id === importId &&
      now - current.startedAt < TVTIME_IMPORT_SESSION_MAX_LIFETIME_MS
    ) {
      // Running again (e.g. retrying failed chunks), so it blocks other imports until it finishes.
      session = { ...current, finishedAt: null };
    } else {
      if (
        current &&
        current.id !== importId &&
        !current.finishedAt &&
        now - current.lastChunkAt < TVTIME_IMPORT_SESSION_STALE_MS
      ) {
        throwRefused('in_progress', current.lastChunkAt + TVTIME_IMPORT_SESSION_STALE_MS - now);
      }
      if (current && now < current.nextAllowedImportAt) {
        throwRefused('cooldown', current.nextAllowedImportAt - now, current.nextAllowedImportAt);
      }
      session = {
        chunks: 0,
        finishedAt: null,
        id: importId,
        lastChunkAt: now,
        nextAllowedImportAt: now + cooldownMs,
        startedAt: now,
      };
    }

    if (session.chunks >= TVTIME_IMPORT_MAX_CHUNKS_PER_SESSION) {
      throwRefused('session_chunks', null);
    }

    recentCalls.push(now);
    const next: TvTimeImportLimitDoc = {
      recentCalls,
      session: { ...session, chunks: session.chunks + 1, lastChunkAt: now },
      updatedAt: now,
    };
    transaction.set(ref, next);
  });
}

/** Marks the import finished after its final chunk succeeds, so a new import isn't refused as `in_progress`. */
export async function markTvTimeImportFinished(
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number
): Promise<void> {
  const ref = db.collection('users').doc(userId).collection('import_limits').doc('tvtime');

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.data() as Partial<TvTimeImportLimitDoc> | undefined;
    if (!state?.session || state.session.id !== importId) {
      return;
    }
    transaction.set(ref, {
      ...state,
      session: { ...state.session, finishedAt: now },
      updatedAt: now,
    });
  });
}

function throwRefused(
  reason: TvTimeRateLimitDetails['reason'],
  retryAfterMs: number | null,
  nextAllowedImportAt?: number
): never {
  const details: TvTimeRateLimitDetails = {
    reason,
    retryAfterMs: retryAfterMs === null ? null : Math.max(0, Math.ceil(retryAfterMs)),
    ...(nextAllowedImportAt !== undefined
      ? { nextAllowedImportAt: new Date(nextAllowedImportAt).toISOString() }
      : {}),
  };

  switch (reason) {
    case 'in_progress':
      throw new HttpsError('already-exists', 'A TV Time import is already in progress.', details);
    case 'cooldown':
      throw new HttpsError(
        'resource-exhausted',
        'Please wait before starting another TV Time import.',
        details
      );
    case 'burst':
      throw new HttpsError(
        'resource-exhausted',
        'Too many import requests. Please slow down.',
        details
      );
    case 'session_chunks':
      throw new HttpsError(
        'resource-exhausted',
        'This import is larger than the supported maximum.',
        details
      );
  }
}

// ---------------------------------------------------------------------------
// TMDB resolution
// ---------------------------------------------------------------------------

async function resolveShow(
  context: TvTimeImportContext,
  entity: TvTimeShowEntity
): Promise<ShowResolution> {
  const resolution = await resolveTmdbShow(context, entity);
  if (resolution.kind !== 'resolved') {
    return resolution;
  }

  const mapped = await mapPlays(context, resolution.value.id, entity.plays);
  return { kind: 'resolved', show: resolution.value, ...mapped };
}

async function resolveTmdbShow(
  context: TvTimeImportContext,
  entity: TvTimeShowEntity
): Promise<TitleResolution<TmdbTvResult>> {
  if (entity.tvdbId !== null) {
    // Only tv_results: TVDB show and episode ids overlap, so an episode hit here is a false match.
    const found = await findByExternalId(context, 'tvdb_id', String(entity.tvdbId));
    const show = found.tv_results?.[0];
    if (show) {
      return { kind: 'resolved', value: show };
    }
  }

  if (entity.imdbId !== null) {
    const found = await findByExternalId(context, 'imdb_id', entity.imdbId);
    const show = found.tv_results?.[0];
    if (show) {
      return { kind: 'resolved', value: show };
    }
  }

  if (!entity.title) {
    return { kind: 'unresolved' };
  }

  const { title, year } = splitTitleYear(entity.title);
  const response = await requestTmdb<TmdbSearchResponse<TmdbTvSearchResult>>(
    `/search/tv?query=${encodeURIComponent(title)}`,
    context.tmdbApiKey
  );

  return pickExactTitleMatch(
    response.results ?? [],
    [title],
    (result) => [result.name, result.original_name],
    (result) => parseYear(result.first_air_date),
    year,
    0
  );
}

async function resolveMovie(
  context: TvTimeImportContext,
  entity: TvTimeMovieEntity
): Promise<MovieResolution> {
  if (entity.tmdbId !== undefined) {
    const movie = await requestTmdbOrNull<TmdbMovieDetails>(
      `/movie/${entity.tmdbId}`,
      context.tmdbApiKey
    );
    if (movie) {
      return {
        kind: 'resolved',
        value: { ...movie, genre_ids: movie.genres?.map((genre) => genre.id) },
      };
    }
  }

  if (entity.imdbId !== null) {
    const found = await findByExternalId(context, 'imdb_id', entity.imdbId);
    const movie = found.movie_results?.[0];
    if (movie) {
      return { kind: 'resolved', value: movie };
    }
  }

  if (entity.tvdbId !== null) {
    const found = await findByExternalId(context, 'tvdb_id', String(entity.tvdbId));
    const movie = found.movie_results?.[0];
    if (movie) {
      return { kind: 'resolved', value: movie };
    }
  }

  const queries = uniqueNonEmpty([entity.title, entity.altTitle ?? '']);
  let sawAmbiguous = false;

  for (const query of queries) {
    const { title, year: titleYear } = splitTitleYear(query);
    const response = await requestTmdb<TmdbSearchResponse<TmdbMovieSearchResult>>(
      `/search/movie?query=${encodeURIComponent(title)}`,
      context.tmdbApiKey
    );
    const match = pickExactTitleMatch(
      response.results ?? [],
      [title],
      (result) => [result.title, result.original_title],
      (result) => parseYear(result.release_date),
      entity.year ?? titleYear,
      1
    );

    if (match.kind === 'resolved') {
      return match;
    }
    sawAmbiguous = sawAmbiguous || match.kind === 'ambiguous';
  }

  return { kind: sawAmbiguous ? 'ambiguous' : 'unresolved' };
}

/**
 * Accepts only exact normalized-title matches. Several exact matches are narrowed by
 * year (± `yearTolerance`); anything still ambiguous is reported rather than guessed.
 */
export function pickExactTitleMatch<T>(
  results: T[],
  queries: string[],
  titlesOf: (result: T) => (string | undefined)[],
  yearOf: (result: T) => number | null,
  year: number | null,
  yearTolerance: number
): TitleResolution<T> {
  const wanted = new Set(queries.map(normalizeTitle).filter(Boolean));
  const exact = results.filter((result) =>
    titlesOf(result).some((candidate) => candidate && wanted.has(normalizeTitle(candidate)))
  );

  if (year !== null) {
    const byYear = exact.filter((result) => {
      const resultYear = yearOf(result);
      return resultYear !== null && Math.abs(resultYear - year) <= yearTolerance;
    });
    if (byYear.length === 1) {
      return { kind: 'resolved', value: byYear[0] };
    }
    if (byYear.length > 1) {
      return { kind: 'ambiguous' };
    }
  }

  if (exact.length === 1) {
    return { kind: 'resolved', value: exact[0] };
  }

  return exact.length > 1 ? { kind: 'ambiguous' } : { kind: 'unresolved' };
}

const NON_ALPHANUMERIC = new RegExp('[^\\p{L}\\p{N}]+', 'gu');

export function normalizeTitle(value: string): string {
  return (
    value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      // Recompose: NFKD also splits Hangul syllables into jamo.
      .normalize('NFC')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(NON_ALPHANUMERIC, ' ')
      .trim()
  );
}

/** "The Office (2005)" → { title: "The Office", year: 2005 }. */
export function splitTitleYear(value: string): { title: string; year: number | null } {
  const match = value.trim().match(/^(.*\S)\s*\((\d{4})\)$/);
  if (!match) {
    return { title: value.trim(), year: null };
  }
  return { title: match[1], year: Number(match[2]) };
}

/**
 * Maps TV Time (TVDB-numbered) plays onto TMDB episodes. Seasons are fetched once per
 * show via append_to_response; a play whose number is missing on TMDB falls back to a
 * TVDB episode-id lookup (bounded per call). Repeat plays collapse to the latest.
 */
async function mapPlays(
  context: TvTimeImportContext,
  showId: number,
  plays: TvTimeEpisodePlay[]
): Promise<{ episodes: Map<string, MappedEpisode>; rewatches: number; unmatched: number }> {
  const episodes = new Map<string, MappedEpisode>();
  let rewatches = 0;
  let unmatched = 0;

  if (plays.length === 0) {
    return { episodes, rewatches, unmatched };
  }

  prefetchSeasons(
    context,
    showId,
    Array.from(new Set(plays.map((play) => play.season))).sort((left, right) => left - right)
  );

  for (const play of plays) {
    let episode = await getSeasonEpisode(context, showId, play.season, play.episode);

    if (!episode && play.tvdbEpisodeId !== undefined && context.fallbackLookupsRemaining > 0) {
      context.fallbackLookupsRemaining -= 1;
      const found = await findByExternalId(context, 'tvdb_id', String(play.tvdbEpisodeId));
      const hit = found.tv_episode_results?.find((result) => result.show_id === showId);
      if (hit) {
        episode = (await getSeasonEpisode(
          context,
          showId,
          hit.season_number,
          hit.episode_number
        )) ?? {
          air_date: hit.air_date ?? null,
          episode_number: hit.episode_number,
          id: hit.id,
          name: hit.name,
          season_number: hit.season_number,
        };
      }
    }

    if (!episode) {
      unmatched += 1;
      continue;
    }

    const key = `${episode.season_number}_${episode.episode_number}`;
    const existing = episodes.get(key);
    if (existing) {
      rewatches += 1;
      existing.watchedAt = Math.max(existing.watchedAt, play.watchedAt);
      continue;
    }

    episodes.set(key, {
      episodeAirDate: episode.air_date ?? null,
      episodeId: episode.id,
      episodeName: episode.name,
      episodeNumber: episode.episode_number,
      runtimeMinutes:
        typeof episode.runtime === 'number' && episode.runtime > 0 ? episode.runtime : undefined,
      seasonNumber: episode.season_number,
      tvShowId: showId,
      watchedAt: play.watchedAt,
    });
  }

  return { episodes, rewatches, unmatched };
}

function prefetchSeasons(context: TvTimeImportContext, showId: number, seasons: number[]): void {
  const missing = seasons.filter((season) => !context.seasonCache.has(seasonKey(showId, season)));

  for (let start = 0; start < missing.length; start += MAX_APPENDED_SEASONS) {
    const batch = missing.slice(start, start + MAX_APPENDED_SEASONS);
    const append = batch.map((season) => `season/${season}`).join(',');
    const request = requestTmdbOrNull<TmdbTvDetailsWithSeasons>(
      `/tv/${showId}?append_to_response=${append}`,
      context.tmdbApiKey
    );

    if (!context.detailsCache.has(showId)) {
      context.detailsCache.set(showId, handled(request.then((details) => details)));
    }
    batch.forEach((season) => {
      context.seasonCache.set(
        seasonKey(showId, season),
        handled(
          request.then((details) =>
            indexSeason(details?.[`season/${season}`] as TmdbSeason | undefined)
          )
        )
      );
    });
  }
}

async function getSeasonEpisode(
  context: TvTimeImportContext,
  showId: number,
  season: number,
  episode: number
): Promise<TmdbSeasonEpisode | null> {
  const key = seasonKey(showId, season);
  if (!context.seasonCache.has(key)) {
    context.seasonCache.set(
      key,
      handled(
        requestTmdbOrNull<TmdbSeason>(`/tv/${showId}/season/${season}`, context.tmdbApiKey).then(
          (data) => indexSeason(data ?? undefined)
        )
      )
    );
  }

  const index = await context.seasonCache.get(key)!;
  return index?.get(episode) ?? null;
}

async function getShowDetails(
  context: TvTimeImportContext,
  showId: number
): Promise<TmdbTvDetails | null> {
  if (!context.detailsCache.has(showId)) {
    context.detailsCache.set(
      showId,
      handled(requestTmdbOrNull<TmdbTvDetails>(`/tv/${showId}`, context.tmdbApiKey))
    );
  }
  return context.detailsCache.get(showId)!;
}

function findByExternalId(
  context: TvTimeImportContext,
  source: 'imdb_id' | 'tvdb_id',
  id: string
): Promise<TmdbFindResponse> {
  const key = `${source}:${id}`;
  if (!context.findCache.has(key)) {
    context.findCache.set(
      key,
      handled(
        requestTmdb<TmdbFindResponse>(
          `/find/${encodeURIComponent(id)}?external_source=${source}`,
          context.tmdbApiKey
        )
      )
    );
  }
  return context.findCache.get(key)!;
}

function indexSeason(season: TmdbSeason | undefined | null): SeasonIndex | null {
  if (!season || !Array.isArray(season.episodes)) {
    return null;
  }
  return new Map(season.episodes.map((episode) => [episode.episode_number, episode]));
}

function seasonKey(showId: number, season: number): string {
  return `${showId}:${season}`;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function writeShow(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  entity: TvTimeShowEntity,
  resolution: ShowResolution
): Promise<void> {
  if (resolution.kind !== 'resolved') {
    skip(stats, resolution.kind === 'ambiguous' ? 'ambiguous_title' : 'unresolved_show');
    addUnresolvedTitle(stats, entity.title);
    return;
  }

  const { show } = resolution;
  const isPrimaryPart = !entity.part || entity.part.index === 0;
  const writesBefore = countWrites(stats);

  if (resolution.unmatched > 0) {
    skip(stats, 'unmatched_episode', resolution.unmatched);
  }
  if (resolution.rewatches > 0) {
    ignore(stats, 'rewatched_episodes', resolution.rewatches);
  }
  if (resolution.episodes.size > 0) {
    await writeEpisodeTracking(context, stats, show, resolution.episodes);
  }

  if (!isPrimaryPart) {
    return;
  }

  const media: ResolvedListMedia = { kind: 'tv', value: show };

  if (entity.status) {
    const listId = await getStatusListId(context, entity.status, show.id);
    await addToList(context, stats, listId, entity.addedAt, media);
  }
  if (entity.favorite) {
    await addToList(context, stats, 'favorites', entity.addedAt, media);
  }
  await addToCustomLists(context, stats, entity.lists, media);
  await writeRating(context, stats, entity.rating, media);

  // Counted on the primary part only, when the show (or its first part) added anything.
  if (countWrites(stats) > writesBefore) {
    stats.imported.shows += 1;
  }
}

/** Items written so far, to tell whether a show or movie added anything new. */
function countWrites(stats: TvTimeImportStats): number {
  const { imported } = stats;
  return imported.watchedEpisodes + imported.watchedMovies + imported.listItems + imported.ratings;
}

async function writeEpisodeTracking(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  show: TmdbTvResult,
  episodes: Map<string, MappedEpisode>
): Promise<void> {
  const ref = context.db
    .collection('users')
    .doc(context.userId)
    .collection('episode_tracking')
    .doc(String(show.id));
  // A transaction, so an episode the user marks in the app meanwhile is never overwritten.
  // Stats are applied only after it commits (the callback can run more than once).
  const { alreadyTracked, newCount } = await context.db.runTransaction(async (transaction) => {
    // Includes episodes in overflow pages (very long shows); new ones go wherever there's room.
    const tracking = await readEpisodeTracking(ref, transaction);
    const existing = tracking.data;
    const existingEpisodes = tracking.items as Record<string, unknown>;
    const existingMetadata = (existing.metadata ?? {}) as Record<string, unknown>;

    const newEpisodes: Record<string, Partial<MappedEpisode>> = {};
    let latestWatchedAt = 0;
    let tracked = 0;

    episodes.forEach((episode, key) => {
      if (existingEpisodes[key]) {
        tracked += 1;
        return;
      }
      newEpisodes[key] = removeUndefined({ ...episode });
      latestWatchedAt = Math.max(latestWatchedAt, episode.watchedAt);
    });

    const count = Object.keys(newEpisodes).length;
    if (count > 0) {
      // Watch Progress sorts by lastUpdated: use the real latest watch, never "now",
      // so a bulk import keeps the user's actual viewing order.
      const existingLastUpdated =
        typeof existingMetadata.lastUpdated === 'number' ? existingMetadata.lastUpdated : 0;

      stageEpisodeWrites(
        transaction,
        tracking,
        planEpisodeWrites(tracking, {
          set: newEpisodes as Record<string, Record<string, unknown>>,
        }),
        {
          metadata: {
            lastUpdated: Math.max(existingLastUpdated, latestWatchedAt),
            posterPath:
              (existingMetadata.posterPath as string | null | undefined) ??
              show.poster_path ??
              null,
            tvShowName: (existingMetadata.tvShowName as string | undefined) ?? show.name,
          },
        }
      );
    }

    return { alreadyTracked: tracked, newCount: count };
  });

  if (alreadyTracked > 0) {
    skip(stats, 'already_tracked_episode', alreadyTracked);
  }
  stats.imported.watchedEpisodes += newCount;
}

async function getStatusListId(
  context: TvTimeImportContext,
  status: TvTimeShowStatus,
  showId: number
): Promise<string> {
  switch (status) {
    case 'watchlist':
      return 'watchlist';
    case 'watching':
      return 'currently-watching';
    case 'dropped':
      return 'dropped';
    case 'up_to_date': {
      const details = await getShowDetails(context, showId);
      return details?.status && ENDED_SHOW_STATUSES.has(details.status)
        ? 'already-watched'
        : 'currently-watching';
    }
  }
}

async function writeMovie(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  entity: TvTimeMovieEntity,
  resolution: MovieResolution
): Promise<void> {
  if (resolution.kind !== 'resolved') {
    skip(stats, resolution.kind === 'ambiguous' ? 'ambiguous_title' : 'unresolved_movie');
    addUnresolvedTitle(stats, entity.title);
    return;
  }

  const movie = resolution.value;
  const media: ResolvedListMedia = { kind: 'movie', value: movie };
  const writesBefore = countWrites(stats);

  const watches = Array.from(new Set(entity.watches)).sort((left, right) => left - right);
  if (watches.length > 0) {
    if (await hasOwnMovieWatches(context, movie.id)) {
      // Never overwrite: ShowSeek's own watch history for this movie wins.
      skip(stats, 'already_tracked_movie');
    } else {
      for (const watchedAt of watches) {
        const didWrite = await upsertMovieWatch(
          context,
          movie.id,
          `${MOVIE_WATCH_DOC_PREFIX}${movie.id}-${watchedAt}`,
          watchedAt
        );
        if (didWrite) {
          stats.imported.watchedMovies += 1;
        }
      }
    }
    await addToList(context, stats, 'already-watched', watches[watches.length - 1], media);
  }

  if (entity.watchlist) {
    await addToList(context, stats, 'watchlist', entity.addedAt, media);
  }
  if (entity.favorite) {
    await addToList(context, stats, 'favorites', entity.addedAt, media);
  }
  await addToCustomLists(context, stats, entity.lists, media);
  await writeRating(context, stats, entity.rating, media);

  if (countWrites(stats) > writesBefore) {
    stats.imported.movies += 1;
  }
}

/** True when the movie has watches that did not come from a previous TV Time import. */
async function hasOwnMovieWatches(context: TvTimeImportContext, movieId: number): Promise<boolean> {
  const snapshot = await context.db
    .collection('users')
    .doc(context.userId)
    .collection('watched_movies')
    .doc(String(movieId))
    .collection('watches')
    .get();

  return snapshot.docs.some((doc) => !doc.id.startsWith(MOVIE_WATCH_DOC_PREFIX));
}

async function addToList(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  listId: string,
  addedAt: number,
  media: ResolvedListMedia
): Promise<void> {
  const didWrite = await upsertListMembership(
    context,
    listId,
    LIST_NAME_BY_ID[listId] ?? listId,
    addedAt,
    media
  );
  if (didWrite) {
    stats.imported.listItems += 1;
  }
}

async function addToCustomLists(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  lists: TvTimeListMembership[],
  media: ResolvedListMedia
): Promise<void> {
  for (const list of lists) {
    const { created, listId } = await ensureCustomList(context, list.name);
    if (created) {
      stats.imported.customListsCreated += 1;
    }
    const didWrite = await upsertListMembership(context, listId, list.name, list.addedAt, media);
    if (didWrite) {
      stats.imported.listItems += 1;
    }
  }
}

async function writeRating(
  context: TvTimeImportContext,
  stats: TvTimeImportStats,
  rating: TvTimeRating | null,
  media: ResolvedListMedia
): Promise<void> {
  if (!rating) {
    return;
  }

  const didWrite = await upsertMovieOrTvRating(
    context,
    media,
    { ratedAt: rating.ratedAt, rating: rating.value },
    'never'
  );
  if (didWrite) {
    stats.imported.ratings += 1;
  } else {
    skip(stats, 'existing_rating');
  }
}

function skip(stats: TvTimeImportStats, reason: TvTimeSkipReason, amount = 1): void {
  stats.skipped = incrementTvTimeStat(stats.skipped, reason, amount);
}

function ignore(stats: TvTimeImportStats, reason: TvTimeIgnoredReason, amount = 1): void {
  stats.ignored = incrementTvTimeStat(stats.ignored, reason, amount);
}

function addUnresolvedTitle(stats: TvTimeImportStats, title: string): void {
  if (
    title &&
    stats.unresolvedTitles.length < TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK &&
    !stats.unresolvedTitles.includes(title)
  ) {
    stats.unresolvedTitles.push(title);
  }
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

export function parseTvTimeImportChunk(data: unknown): TvTimeImportChunkRequest {
  const payload = parseObject(data, 'data');

  if (typeof payload.importId !== 'string' || !TVTIME_IMPORT_ID_PATTERN.test(payload.importId)) {
    throw new HttpsError(
      'invalid-argument',
      'importId must be 8–64 characters of letters, digits or dashes.'
    );
  }
  if (!Array.isArray(payload.shows) || !Array.isArray(payload.movies)) {
    throw new HttpsError('invalid-argument', 'shows and movies must be arrays.');
  }
  if (payload.shows.length + payload.movies.length > TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK) {
    throw new HttpsError('invalid-argument', 'Chunk size exceeds the supported maximum.');
  }

  const shows = payload.shows.map((show, index) => parseShow(show, `shows[${index}]`));
  const movies = payload.movies.map((movie, index) => parseMovie(movie, `movies[${index}]`));
  const totalPlays = shows.reduce((total, show) => total + show.plays.length, 0);

  if (totalPlays > TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK) {
    throw new HttpsError(
      'invalid-argument',
      `Chunk exceeds the supported maximum of ${TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK} episode plays.`
    );
  }

  if (payload.final !== undefined && typeof payload.final !== 'boolean') {
    throw new HttpsError('invalid-argument', 'final must be a boolean.');
  }

  return {
    importId: payload.importId,
    movies,
    shows,
    ...(payload.final === true ? { final: true } : {}),
  };
}

function parseShow(raw: unknown, path: string): TvTimeShowEntity {
  const show = parseObject(raw, path);
  const status = show.status ?? null;

  if (status !== null && !SHOW_STATUSES.includes(status as TvTimeShowStatus)) {
    throw new HttpsError(
      'invalid-argument',
      `${path}.status must be one of ${SHOW_STATUSES.join(', ')} or null.`
    );
  }
  if (!Array.isArray(show.plays)) {
    throw new HttpsError('invalid-argument', `${path}.plays must be an array.`);
  }

  const entity: TvTimeShowEntity = {
    addedAt: parseTimestamp(show.addedAt, `${path}.addedAt`),
    favorite: parseBoolean(show.favorite, `${path}.favorite`),
    imdbId: parseImdbId(show.imdbId, `${path}.imdbId`),
    lists: parseLists(show.lists, `${path}.lists`),
    plays: show.plays.map((play, index) => parsePlay(play, `${path}.plays[${index}]`)),
    rating: parseRating(show.rating, `${path}.rating`),
    status: status as TvTimeShowStatus | null,
    title: parseTitle(show.title, `${path}.title`),
    tvdbId: parseOptionalPositiveInt(show.tvdbId, `${path}.tvdbId`),
  };

  if (show.part !== undefined) {
    const part = parseObject(show.part, `${path}.part`);
    const total = parseIntInRange(part.total, `${path}.part.total`, 1, 1000);
    entity.part = { index: parseIntInRange(part.index, `${path}.part.index`, 0, total - 1), total };
  }

  assertHasIdentifier(entity, path);
  return entity;
}

function parseMovie(raw: unknown, path: string): TvTimeMovieEntity {
  const movie = parseObject(raw, path);

  if (!Array.isArray(movie.watches) || movie.watches.length > TVTIME_IMPORT_MAX_MOVIE_WATCHES) {
    throw new HttpsError(
      'invalid-argument',
      `${path}.watches must be an array of at most ${TVTIME_IMPORT_MAX_MOVIE_WATCHES} timestamps.`
    );
  }

  const entity: TvTimeMovieEntity = {
    addedAt: parseTimestamp(movie.addedAt, `${path}.addedAt`),
    favorite: parseBoolean(movie.favorite, `${path}.favorite`),
    imdbId: parseImdbId(movie.imdbId, `${path}.imdbId`),
    lists: parseLists(movie.lists, `${path}.lists`),
    rating: parseRating(movie.rating, `${path}.rating`),
    title: parseTitle(movie.title, `${path}.title`),
    tvdbId: parseOptionalPositiveInt(movie.tvdbId, `${path}.tvdbId`),
    watches: movie.watches.map((watch, index) =>
      parseTimestamp(watch, `${path}.watches[${index}]`)
    ),
    watchlist: parseBoolean(movie.watchlist, `${path}.watchlist`),
    year:
      movie.year === null || movie.year === undefined
        ? null
        : parseIntInRange(movie.year, `${path}.year`, 1870, 2100),
  };

  if (movie.tmdbId !== undefined && movie.tmdbId !== null) {
    entity.tmdbId = parseIntInRange(movie.tmdbId, `${path}.tmdbId`, 1, Number.MAX_SAFE_INTEGER);
  }

  if (movie.altTitle !== undefined) {
    entity.altTitle = parseTitle(movie.altTitle, `${path}.altTitle`);
  }

  assertHasIdentifier(entity, path);
  return entity;
}

function parsePlay(raw: unknown, path: string): TvTimeEpisodePlay {
  const play = parseObject(raw, path);
  const parsed: TvTimeEpisodePlay = {
    episode: parseIntInRange(play.episode, `${path}.episode`, 0, MAX_EPISODE_NUMBER),
    season: parseIntInRange(play.season, `${path}.season`, 0, MAX_EPISODE_NUMBER),
    watchedAt: parseTimestamp(play.watchedAt, `${path}.watchedAt`),
  };

  if (play.tvdbEpisodeId !== undefined && play.tvdbEpisodeId !== null) {
    parsed.tvdbEpisodeId =
      parseOptionalPositiveInt(play.tvdbEpisodeId, `${path}.tvdbEpisodeId`) ?? undefined;
  }

  return parsed;
}

function parseLists(raw: unknown, path: string): TvTimeListMembership[] {
  if (!Array.isArray(raw) || raw.length > TVTIME_IMPORT_MAX_LISTS_PER_ENTITY) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be an array of at most ${TVTIME_IMPORT_MAX_LISTS_PER_ENTITY} lists.`
    );
  }

  return raw.map((entry, index) => {
    const list = parseObject(entry, `${path}[${index}]`);
    const name = parseTitle(list.name, `${path}[${index}].name`);
    if (!name) {
      throw new HttpsError(
        'invalid-argument',
        `${path}[${index}].name must be a non-empty string.`
      );
    }
    return { addedAt: parseTimestamp(list.addedAt, `${path}[${index}].addedAt`), name };
  });
}

function parseRating(raw: unknown, path: string): TvTimeRating | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const rating = parseObject(raw, path);
  return {
    ratedAt: parseTimestamp(rating.ratedAt, `${path}.ratedAt`),
    value: parseIntInRange(rating.value, `${path}.value`, 1, 10),
  };
}

function assertHasIdentifier(
  entity: { imdbId: string | null; title: string; tvdbId: number | null },
  path: string
): void {
  if (entity.tvdbId === null && entity.imdbId === null && !entity.title) {
    throw new HttpsError('invalid-argument', `${path} needs a tvdbId, imdbId or title.`);
  }
}

function parseObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function parseTitle(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length > MAX_TITLE_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be a string of at most ${MAX_TITLE_LENGTH} characters.`
    );
  }
  return value.trim();
}

function parseImdbId(value: unknown, path: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string' || !/^tt\d{5,10}$/.test(value)) {
    throw new HttpsError('invalid-argument', `${path} must be an IMDb id like tt0111161 or null.`);
  }
  return value;
}

function parseOptionalPositiveInt(value: unknown, path: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseIntInRange(value, path, 1, Number.MAX_SAFE_INTEGER);
}

function parseIntInRange(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be an integer between ${min} and ${max}.`
    );
  }
  return value;
}

/** 9999-12-31T23:59:59.999Z: the latest instant Firestore and Date can both represent. */
const MAX_TIMESTAMP_MS = 253_402_300_799_999;

function parseTimestamp(value: unknown, path: string): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > MAX_TIMESTAMP_MS
  ) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be a positive epoch-millisecond timestamp no later than year 9999.`
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

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Marks a cached promise as handled so a rejection that is never awaited (because an
 * earlier await already failed the call) can't surface as an unhandled rejection and
 * crash the instance. Awaiting the returned promise still rejects normally.
 */
function handled<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(items[index]);
    }
  });

  await Promise.all(runners);
  return results;
}

function parseYear(date: string | undefined | null): number | null {
  const year = Number(date?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : null;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
