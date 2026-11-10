/**
 * Shared core of the chunked file-import callables (TV Time, Simkl, …): imports one
 * chunk of an export that the app has already parsed on-device. Each source supplies
 * an `ImportSourceConfig`; see `../tvtimeImport.ts` and docs/tvtime-import-plan.md.
 *
 * Per call: auth → validate → premium → rate-limit claim → resolve against TMDB
 * (concurrent, network only) → write to Firestore (sequential). Existing ShowSeek
 * data is never overwritten; every write is idempotent so chunks can be retried.
 */
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { planEpisodeWrites, readEpisodeTracking, stageEpisodeWrites } from '../episodePagesAdmin';
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
} from '../importWrites';
import {
  TEST_FILE_IMPORT_COOLDOWN_MS,
  FILE_IMPORT_COOLDOWN_MS,
  FILE_IMPORT_ID_PATTERN,
  FILE_IMPORT_MAX_CALLS_PER_MINUTE,
  FILE_IMPORT_MAX_CHUNKS_PER_SESSION,
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_LISTS_PER_ENTITY,
  FILE_IMPORT_MAX_MOVIE_WATCHES,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK,
  FILE_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK,
  FILE_IMPORT_SESSION_MAX_LIFETIME_MS,
  FILE_IMPORT_SESSION_STALE_MS,
  createEmptyFileImportStats,
  incrementFileImportStat,
  type FileImportAnimeNumbering,
  type FileImportEpisodePlay,
  type FileImportWatchedThrough,
  type FileImportIgnoredReason,
  type FileImportChunkRequest,
  type FileImportChunkResult,
  type FileImportLimitDoc,
  type FileImportStats,
  type FileImportListMembership,
  type FileImportMovieEntity,
  type FileImportRateLimitDetails,
  type FileImportRating,
  type FileImportShowEntity,
  type FileImportShowStatus,
  type FileImportSkipReason,
} from '../shared/fileImport';
import { TRAKT_SYNC_BYPASS_UIDS_ENV } from '../trakt/constants';

const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

/** Parallel TMDB requests per call. With maxInstances 10 × concurrency 1 this caps the function at ~40 in flight. */
const TMDB_CONCURRENCY = 4;
/** Per-call budget for per-episode TVDB lookups used to repair numbering mismatches. */
const MAX_EPISODE_FALLBACK_LOOKUPS = 150;
/** TMDB allows at most 20 `append_to_response` entries per request. */
const MAX_APPENDED_SEASONS = 20;
const ENDED_SHOW_STATUSES = new Set(['Ended', 'Canceled']);
const MAX_TITLE_LENGTH = 500;
const MAX_EPISODE_NUMBER = 10_000;
/**
 * "Watched up to" episodes one call may expand, across all its shows. Listed plays are
 * capped by FILE_IMPORT_MAX_PLAYS_PER_CHUNK; this caps expansion, which a crafted chunk
 * could otherwise push to every episode of 15 long-running shows. It sits above the
 * longest daily soaps (~15,000 episodes), so the client's chunks (≤ ~1,500 expected
 * writes, or one heavy show on its own) never reach it.
 */
const MAX_EXPANDED_EPISODES_PER_CALL = 20_000;

const MINUTE_MS = 60 * 1000;

/** What differs between import sources. Everything else is shared. */
export interface ImportSourceConfig {
  /** Shown in user-facing error messages, e.g. "TV Time". */
  displayName: string;
  /** Rate-limit state lives at users/{uid}/import_limits/{limitDocId}. */
  limitDocId: string;
  /** Prefix of the movie watch doc ids this source writes, e.g. "tvtime-". */
  movieWatchDocPrefix: string;
  /** Prefix of the per-chunk log line, e.g. "[tvtimeImport]". */
  logTag: string;
  /**
   * When a show has plays TMDB's numbering can't place, retry them through TMDB's
   * community "TVDB order" episode group. Off for TV Time (its behaviour is pinned).
   */
  episodeGroupFallback: boolean;
  /** Return `unmatchedEpisodeTitles` so the summary can name shows with unplaced episodes. */
  reportUnmatchedEpisodeTitles: boolean;
}

/** Per-call budget of shows retried through a TMDB episode group (2 requests each). */
const MAX_EPISODE_GROUP_LOOKUPS = 10;
/** An episode can be watched on the day it airs, whatever the time zones. */
const DAY_MS = 24 * 60 * 60 * 1000;

const SHOW_STATUSES: readonly FileImportShowStatus[] = [
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

/** The parts of a `/tv/{id}` response the Simkl paths read (not in `TmdbTvDetails`). */
type TmdbShowDetails = TmdbTvDetails & {
  genres?: { id: number }[];
  seasons?: { episode_count?: number; season_number: number }[];
};

interface TmdbEpisodeGroupList {
  results?: { id: string; name?: string }[];
}

interface TmdbEpisodeGroup {
  groups?: {
    name?: string;
    order?: number;
    episodes?: (TmdbSeasonEpisode & { order?: number })[];
  }[];
}

interface MappedPlays {
  episodes: Map<string, MappedEpisode>;
  rewatches: number;
  unmatched: number;
}

interface TmdbSearchResponse<T> {
  results?: T[];
}

type TmdbTvSearchResult = TmdbTvResult & { original_name?: string };
type TmdbMovieSearchResult = TmdbMovieResult & { original_title?: string };
type TmdbMovieDetails = TmdbMovieResult & { genres?: { id: number }[] };

type SeasonIndex = Map<number, TmdbSeasonEpisode>;

interface FileImportContext extends ImportWriteContext {
  source: ImportSourceConfig;
  tmdbApiKey: string;
  findCache: Map<string, Promise<TmdbFindResponse>>;
  detailsCache: Map<number, Promise<TmdbTvDetails | null>>;
  seasonCache: Map<string, Promise<SeasonIndex | null>>;
  fallbackLookupsRemaining: number;
  episodeGroupLookupsRemaining: number;
  /** "Watched up to" episodes this call may still expand (MAX_EXPANDED_EPISODES_PER_CALL). */
  expansionBudget: number;
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
      /** Anime plays that couldn't be placed (always 0 for non-anime entities). */
      animeUnmatched: number;
    }
  | { kind: 'ambiguous' }
  | { kind: 'unresolved' };

type MovieResolution = TitleResolution<TmdbMovieResult>;

/** Builds one source's callable. Each source is exported under its own name from `functions/src/index.ts`. */
export function createFileImportCallable(source: ImportSourceConfig) {
  return onCall(
    {
      concurrency: 1,
      maxInstances: 10,
      memory: '512MiB',
      secrets: [TMDB_API_KEY],
      timeoutSeconds: 300,
    },
    (request) => handleFileImportChunk(source, request)
  );
}

async function handleFileImportChunk(
  source: ImportSourceConfig,
  request: { auth?: { token?: unknown; uid?: string }; data: unknown }
): Promise<FileImportChunkResult> {
  const userId = requireSignedInUser(request.auth);
  const payload = parseFileImportChunk(request.data);
  const db = admin.firestore();
  await assertPremiumUser(db, userId, `${source.displayName} import requires Premium.`);

  const tmdbApiKey = TMDB_API_KEY.value().trim();
  if (!tmdbApiKey) {
    throw new HttpsError('failed-precondition', 'TMDB import is not configured.');
  }

  await claimImportChunkSlot(
    source,
    db,
    userId,
    payload.importId,
    Date.now(),
    isImportCooldownBypassed(userId) ? TEST_FILE_IMPORT_COOLDOWN_MS : FILE_IMPORT_COOLDOWN_MS
  );

  const context: FileImportContext = {
    ...(await createImportWriteContext(db, userId)),
    detailsCache: new Map(),
    episodeGroupLookupsRemaining: MAX_EPISODE_GROUP_LOOKUPS,
    expansionBudget: MAX_EXPANDED_EPISODES_PER_CALL,
    fallbackLookupsRemaining: MAX_EPISODE_FALLBACK_LOOKUPS,
    findCache: new Map(),
    seasonCache: new Map(),
    source,
    tmdbApiKey,
  };

  const stats = createEmptyFileImportStats();
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

  console.info(`${source.logTag} chunk complete`, {
    fallbackLookupsUsed: MAX_EPISODE_FALLBACK_LOOKUPS - context.fallbackLookupsRemaining,
    ignored: stats.ignored,
    imported: stats.imported,
    processedEntities: stats.processedEntities,
    skipped: stats.skipped,
    userIdSuffix: userId.slice(-6),
  });

  if (payload.final) {
    await markImportFinished(source, db, userId, payload.importId, Date.now());
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/** Emulator and allowlisted testers get the short test cooldown, as in the Trakt ZIP import. */
export function isImportCooldownBypassed(userId: string): boolean {
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
 * 1. Burst: at most FILE_IMPORT_MAX_CALLS_PER_MINUTE calls in a rolling minute.
 * 2. Same importId (within its max lifetime) → continue that import.
 * 3. Different importId while the current import is still active (not finished, not stale) → `already-exists`.
 * 4. Different importId before the cooldown (measured from the last import's start) → `resource-exhausted`.
 * 5. Per-import chunk cap.
 *
 * Stored at users/{uid}/import_limits/{source.limitDocId}: one doc per source, so one
 * source's cooldown never blocks another. Owner-readable, never client-writable, and
 * removed by account deletion's recursive delete of users/{uid}.
 */
export async function claimImportChunkSlot(
  source: ImportSourceConfig,
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number,
  cooldownMs: number = FILE_IMPORT_COOLDOWN_MS
): Promise<void> {
  const ref = importLimitRef(source, db, userId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = (snapshot.data() ?? {}) as Partial<FileImportLimitDoc>;
    const recentCalls = (state.recentCalls ?? []).filter((at) => now - at < MINUTE_MS);

    if (recentCalls.length >= FILE_IMPORT_MAX_CALLS_PER_MINUTE) {
      throwRefused(source, 'burst', Math.min(...recentCalls) + MINUTE_MS - now);
    }

    const current = state.session;
    let session: FileImportLimitDoc['session'];

    if (
      current &&
      current.id === importId &&
      now - current.startedAt < FILE_IMPORT_SESSION_MAX_LIFETIME_MS
    ) {
      // Running again (e.g. retrying failed chunks), so it blocks other imports until it finishes.
      session = { ...current, finishedAt: null };
    } else {
      if (
        current &&
        current.id !== importId &&
        !current.finishedAt &&
        now - current.lastChunkAt < FILE_IMPORT_SESSION_STALE_MS
      ) {
        throwRefused(
          source,
          'in_progress',
          current.lastChunkAt + FILE_IMPORT_SESSION_STALE_MS - now
        );
      }
      if (current && now < current.nextAllowedImportAt) {
        throwRefused(
          source,
          'cooldown',
          current.nextAllowedImportAt - now,
          current.nextAllowedImportAt
        );
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

    if (session.chunks >= FILE_IMPORT_MAX_CHUNKS_PER_SESSION) {
      throwRefused(source, 'session_chunks', null);
    }

    recentCalls.push(now);
    const next: FileImportLimitDoc = {
      recentCalls,
      session: { ...session, chunks: session.chunks + 1, lastChunkAt: now },
      updatedAt: now,
    };
    transaction.set(ref, next);
  });
}

/** Marks the import finished after its final chunk succeeds, so a new import isn't refused as `in_progress`. */
export async function markImportFinished(
  source: ImportSourceConfig,
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  now: number
): Promise<void> {
  const ref = importLimitRef(source, db, userId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const state = snapshot.data() as Partial<FileImportLimitDoc> | undefined;
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

function importLimitRef(
  source: ImportSourceConfig,
  db: FirebaseFirestore.Firestore,
  userId: string
): FirebaseFirestore.DocumentReference {
  return db.collection('users').doc(userId).collection('import_limits').doc(source.limitDocId);
}

function throwRefused(
  source: ImportSourceConfig,
  reason: FileImportRateLimitDetails['reason'],
  retryAfterMs: number | null,
  nextAllowedImportAt?: number
): never {
  const details: FileImportRateLimitDetails = {
    reason,
    retryAfterMs: retryAfterMs === null ? null : Math.max(0, Math.ceil(retryAfterMs)),
    ...(nextAllowedImportAt !== undefined
      ? { nextAllowedImportAt: new Date(nextAllowedImportAt).toISOString() }
      : {}),
  };

  switch (reason) {
    case 'in_progress':
      throw new HttpsError(
        'already-exists',
        `A ${source.displayName} import is already in progress.`,
        details
      );
    case 'cooldown':
      throw new HttpsError(
        'resource-exhausted',
        `Please wait before starting another ${source.displayName} import.`,
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
  context: FileImportContext,
  entity: FileImportShowEntity
): Promise<ShowResolution> {
  const resolution = await resolveTmdbShow(context, entity);
  if (resolution.kind !== 'resolved') {
    return resolution;
  }

  const showId = resolution.value.id;
  if (entity.anime) {
    return {
      kind: 'resolved',
      show: resolution.value,
      ...(await mapAnimePlays(context, showId, entity)),
    };
  }

  let mapped = await mapPlays(context, showId, entity.plays);
  if (mapped.unmatched > 0 && context.source.episodeGroupFallback) {
    const regrouped = await mapPlaysThroughEpisodeGroup(context, showId, entity.plays);
    // Only when the group places more plays; otherwise TMDB's own numbering stands.
    if (regrouped && regrouped.unmatched < mapped.unmatched) {
      mapped = regrouped;
    }
  }
  if (entity.watchedThrough && entity.watchedThroughAt !== undefined && isFirstPart(entity)) {
    await expandWatchedThrough(
      context,
      showId,
      entity.watchedThrough,
      entity.watchedThroughAt,
      mapped.episodes
    );
  }
  return { kind: 'resolved', show: resolution.value, ...mapped, animeUnmatched: 0 };
}

function isFirstPart(entity: FileImportShowEntity): boolean {
  return !entity.part || entity.part.index === 0;
}

async function resolveTmdbShow(
  context: FileImportContext,
  entity: FileImportShowEntity
): Promise<TitleResolution<TmdbTvResult>> {
  if (entity.tmdbId !== undefined) {
    // A stale TMDB id (404) falls through to the other ids.
    const details = (await getShowDetails(context, entity.tmdbId)) as TmdbShowDetails | null;
    if (details) {
      return {
        kind: 'resolved',
        value: {
          first_air_date: details.first_air_date,
          genre_ids: details.genre_ids ?? details.genres?.map((genre) => genre.id),
          id: details.id,
          name: details.name,
          poster_path: details.poster_path,
          vote_average: details.vote_average,
        },
      };
    }
  }

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

  const { title, year: titleYear } = splitTitleYear(entity.title);
  // A "(YYYY)" suffix wins; otherwise the entity's own year (Simkl), which may be off by one.
  const year = titleYear ?? entity.year ?? null;
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
    titleYear === null && year !== null ? 1 : 0
  );
}

async function resolveMovie(
  context: FileImportContext,
  entity: FileImportMovieEntity
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
 * Maps TVDB-numbered plays (TV Time, Simkl) onto TMDB episodes. Seasons are fetched once per
 * show via append_to_response; a play whose number is missing on TMDB falls back to a
 * TVDB episode-id lookup (bounded per call). Repeat plays collapse to the latest.
 */
async function mapPlays(
  context: FileImportContext,
  showId: number,
  plays: FileImportEpisodePlay[]
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

function prefetchSeasons(context: FileImportContext, showId: number, seasons: number[]): void {
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
  context: FileImportContext,
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
  context: FileImportContext,
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

/** A season's episodes by number (cached per call), or null when TMDB doesn't have the season. */
async function getSeasonIndex(
  context: FileImportContext,
  showId: number,
  season: number
): Promise<SeasonIndex | null> {
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
  return context.seasonCache.get(key)!;
}

/** TMDB's regular seasons (season ≥ 1), in order, with their episode counts. */
async function getRegularSeasons(
  context: FileImportContext,
  showId: number
): Promise<{ episodeCount: number; seasonNumber: number }[]> {
  const details = (await getShowDetails(context, showId)) as TmdbShowDetails | null;
  return (details?.seasons ?? [])
    .filter((season) => season.season_number >= 1)
    .map((season) => ({
      episodeCount: season.episode_count ?? 0,
      seasonNumber: season.season_number,
    }))
    .sort((left, right) => left.seasonNumber - right.seasonNumber);
}

function toMappedEpisode(
  showId: number,
  episode: TmdbSeasonEpisode,
  watchedAt: number
): MappedEpisode {
  return {
    episodeAirDate: episode.air_date ?? null,
    episodeId: episode.id,
    episodeName: episode.name,
    episodeNumber: episode.episode_number,
    runtimeMinutes:
      typeof episode.runtime === 'number' && episode.runtime > 0 ? episode.runtime : undefined,
    seasonNumber: episode.season_number,
    tvShowId: showId,
    watchedAt,
  };
}

/** Adds a play to the mapped set; a repeat of the same episode keeps the latest watch. */
function addMappedPlay(
  result: MappedPlays,
  showId: number,
  episode: TmdbSeasonEpisode,
  watchedAt: number
): void {
  const key = `${episode.season_number}_${episode.episode_number}`;
  const existing = result.episodes.get(key);
  if (existing) {
    result.rewatches += 1;
    existing.watchedAt = Math.max(existing.watchedAt, watchedAt);
    return;
  }
  result.episodes.set(key, toMappedEpisode(showId, episode, watchedAt));
}

/**
 * Retries a show's plays through TMDB's community "TVDB order" episode group, for shows
 * whose TVDB numbering (TV Time, Simkl) doesn't match TMDB's. Every play goes through the
 * group so the whole show uses one numbering. Null when there's no such group or the
 * per-call budget is spent.
 */
async function mapPlaysThroughEpisodeGroup(
  context: FileImportContext,
  showId: number,
  plays: FileImportEpisodePlay[]
): Promise<MappedPlays | null> {
  if (context.episodeGroupLookupsRemaining <= 0) {
    return null;
  }
  context.episodeGroupLookupsRemaining -= 1;

  const list = await requestTmdbOrNull<TmdbEpisodeGroupList>(
    `/tv/${showId}/episode_groups`,
    context.tmdbApiKey
  );
  const group = list?.results?.find((candidate) => /tvdb/i.test(candidate.name ?? ''));
  if (!group) {
    return null;
  }
  const detail = await requestTmdbOrNull<TmdbEpisodeGroup>(
    `/tv/episode_group/${encodeURIComponent(group.id)}`,
    context.tmdbApiKey
  );
  if (!detail?.groups?.length) {
    return null;
  }

  // TVDB coordinate → TMDB episode. A group is one TVDB season ("Season 3", "Specials").
  const byTvdbCoordinate = new Map<string, TmdbSeasonEpisode>();
  [...detail.groups]
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
    .forEach((season, index) => {
      const name = season.name ?? '';
      const numbered = name.match(/season\s*(\d+)/i);
      const seasonNumber = numbered
        ? Number(numbered[1])
        : /special/i.test(name)
          ? 0
          : (season.order ?? index);
      [...(season.episodes ?? [])]
        .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
        .forEach((episode, position) => {
          byTvdbCoordinate.set(`${seasonNumber}_${position + 1}`, episode);
        });
    });

  const result: MappedPlays = { episodes: new Map(), rewatches: 0, unmatched: 0 };
  for (const play of plays) {
    const episode = byTvdbCoordinate.get(`${play.season}_${play.episode}`);
    if (!episode) {
      result.unmatched += 1;
      continue;
    }
    addMappedPlay(result, showId, episode, play.watchedAt);
  }
  return result;
}

/**
 * Marks the episodes behind a "watched up to" point (a Simkl entry without an episode
 * list), stamped with its one date. `all`: every aired regular-season episode up to that
 * date. `through`: every regular-season episode up to S/E (unless TMDB says it aired
 * after that date). Episodes already in `episodes` (explicit plays) are left alone.
 */
async function expandWatchedThrough(
  context: FileImportContext,
  showId: number,
  through: FileImportWatchedThrough,
  watchedAt: number,
  episodes: Map<string, MappedEpisode>
): Promise<void> {
  const cutoff = watchedAt + DAY_MS;
  const regular = (await getRegularSeasons(context, showId)).filter(
    (season) => through.kind === 'all' || season.seasonNumber <= through.season
  );
  // Only fetch the seasons the call's remaining expansion budget can still cover.
  const seasons: number[] = [];
  let covered = 0;
  for (const season of regular) {
    if (covered >= context.expansionBudget) {
      warnExpansionBudgetSpent(context, showId);
      break;
    }
    seasons.push(season.seasonNumber);
    covered += Math.max(1, season.episodeCount);
  }
  prefetchSeasons(context, showId, seasons);

  for (const seasonNumber of seasons) {
    const index = await getSeasonIndex(context, showId, seasonNumber);
    if (!index) {
      continue;
    }
    const seasonEpisodes = [...index.values()].sort(
      (left, right) => left.episode_number - right.episode_number
    );
    for (const episode of seasonEpisodes) {
      if (
        through.kind === 'through' &&
        seasonNumber === through.season &&
        episode.episode_number > through.episode
      ) {
        continue;
      }
      const airedAt = episode.air_date ? Date.parse(episode.air_date) : NaN;
      const aired = Number.isFinite(airedAt) && airedAt <= cutoff;
      const airedLater = Number.isFinite(airedAt) && airedAt > cutoff;
      if (through.kind === 'all' ? !aired : airedLater) {
        continue;
      }
      const key = `${episode.season_number}_${episode.episode_number}`;
      if (!episodes.has(key)) {
        if (context.expansionBudget <= 0) {
          warnExpansionBudgetSpent(context, showId);
          return;
        }
        episodes.set(key, toMappedEpisode(showId, episode, watchedAt));
        context.expansionBudget -= 1;
      }
    }
  }
}

/** Only a crafted chunk gets here: the client's chunks stay far below the budget. */
function warnExpansionBudgetSpent(context: FileImportContext, showId: number): void {
  console.warn(`${context.source.logTag} "watched up to" expansion budget spent`, {
    limit: MAX_EXPANDED_EPISODES_PER_CALL,
    showId,
  });
}

/**
 * Anime plays use the source entry's own numbering (season 1, episodes 1…n). Without a
 * licensed cour → TMDB-season mapping we only place them when it's unambiguous: a single
 * source entry whose episode total equals TMDB's regular-season total, numbered straight
 * through TMDB's seasons (single-season shows, One Piece-style absolute numbering).
 * Everything else is reported as `unmatched_anime_episode`, never guessed.
 */
async function mapAnimePlays(
  context: FileImportContext,
  showId: number,
  entity: FileImportShowEntity
): Promise<MappedPlays & { animeUnmatched: number }> {
  const anime = entity.anime!;
  const empty = { episodes: new Map<string, MappedEpisode>(), rewatches: 0, unmatched: 0 };
  let plays = entity.plays;

  // "Watched up to" in entry numbering → explicit plays 1…n stamped with its one date.
  if (
    entity.watchedThrough &&
    entity.watchedThroughAt !== undefined &&
    anime.entryEpisodeTotal &&
    isFirstPart(entity)
  ) {
    const last =
      entity.watchedThrough.kind === 'all'
        ? anime.entryEpisodeTotal
        : Math.min(entity.watchedThrough.episode, anime.entryEpisodeTotal);
    const listed = new Set(plays.map((play) => `${play.season}_${play.episode}`));
    const expanded: FileImportEpisodePlay[] = [];
    for (let episode = 1; episode <= last; episode += 1) {
      if (!listed.has(`1_${episode}`)) {
        if (context.expansionBudget <= 0) {
          warnExpansionBudgetSpent(context, showId);
          break;
        }
        expanded.push({ episode, season: 1, watchedAt: entity.watchedThroughAt });
        context.expansionBudget -= 1;
      }
    }
    plays = [...plays, ...expanded];
  }

  if (plays.length === 0) {
    return { ...empty, animeUnmatched: 0 };
  }
  if (anime.groupedEntries > 1 || !anime.entryEpisodeTotal) {
    return { ...empty, animeUnmatched: plays.length };
  }

  const seasons = await getRegularSeasons(context, showId);
  const tmdbTotal = seasons.reduce((total, season) => total + season.episodeCount, 0);
  if (tmdbTotal !== anime.entryEpisodeTotal) {
    return { ...empty, animeUnmatched: plays.length };
  }

  /** Entry episode n → TMDB (season, episode), counting straight through the seasons. */
  const toTmdb = (absolute: number): { episode: number; season: number } | null => {
    let remaining = absolute;
    for (const season of seasons) {
      if (remaining <= season.episodeCount) {
        return { episode: remaining, season: season.seasonNumber };
      }
      remaining -= season.episodeCount;
    }
    return null;
  };

  const coordinates = plays.map((play) => (play.season === 1 ? toTmdb(play.episode) : null));
  prefetchSeasons(
    context,
    showId,
    Array.from(
      new Set(coordinates.flatMap((coordinate) => (coordinate ? [coordinate.season] : [])))
    ).sort((left, right) => left - right)
  );

  const result: MappedPlays = { ...empty };
  let animeUnmatched = 0;
  for (let index = 0; index < plays.length; index += 1) {
    const coordinate = coordinates[index];
    const episode = coordinate
      ? await getSeasonEpisode(context, showId, coordinate.season, coordinate.episode)
      : null;
    if (!episode) {
      animeUnmatched += 1;
      continue;
    }
    addMappedPlay(result, showId, episode, plays[index].watchedAt);
  }
  return { ...result, animeUnmatched };
}

function findByExternalId(
  context: FileImportContext,
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
  context: FileImportContext,
  stats: FileImportStats,
  entity: FileImportShowEntity,
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
  if (resolution.animeUnmatched > 0) {
    skip(stats, 'unmatched_anime_episode', resolution.animeUnmatched);
  }
  if (
    context.source.reportUnmatchedEpisodeTitles &&
    resolution.unmatched + resolution.animeUnmatched > 0
  ) {
    addUnmatchedEpisodeTitle(stats, show.name);
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
function countWrites(stats: FileImportStats): number {
  const { imported } = stats;
  return imported.watchedEpisodes + imported.watchedMovies + imported.listItems + imported.ratings;
}

async function writeEpisodeTracking(
  context: FileImportContext,
  stats: FileImportStats,
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
  context: FileImportContext,
  status: FileImportShowStatus,
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
  context: FileImportContext,
  stats: FileImportStats,
  entity: FileImportMovieEntity,
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
          `${context.source.movieWatchDocPrefix}${movie.id}-${watchedAt}`,
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

/** True when the movie has watches that did not come from a previous import of this same source. */
async function hasOwnMovieWatches(context: FileImportContext, movieId: number): Promise<boolean> {
  const snapshot = await context.db
    .collection('users')
    .doc(context.userId)
    .collection('watched_movies')
    .doc(String(movieId))
    .collection('watches')
    .get();

  return snapshot.docs.some((doc) => !doc.id.startsWith(context.source.movieWatchDocPrefix));
}

async function addToList(
  context: FileImportContext,
  stats: FileImportStats,
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
  context: FileImportContext,
  stats: FileImportStats,
  lists: FileImportListMembership[],
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
  context: FileImportContext,
  stats: FileImportStats,
  rating: FileImportRating | null,
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

function skip(stats: FileImportStats, reason: FileImportSkipReason, amount = 1): void {
  stats.skipped = incrementFileImportStat(stats.skipped, reason, amount);
}

function ignore(stats: FileImportStats, reason: FileImportIgnoredReason, amount = 1): void {
  stats.ignored = incrementFileImportStat(stats.ignored, reason, amount);
}

function addUnresolvedTitle(stats: FileImportStats, title: string): void {
  if (
    title &&
    stats.unresolvedTitles.length < FILE_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK &&
    !stats.unresolvedTitles.includes(title)
  ) {
    stats.unresolvedTitles.push(title);
  }
}

function addUnmatchedEpisodeTitle(stats: FileImportStats, title: string): void {
  const titles = (stats.unmatchedEpisodeTitles ??= []);
  if (
    title &&
    titles.length < FILE_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK &&
    !titles.includes(title)
  ) {
    titles.push(title);
  }
}

// ---------------------------------------------------------------------------
// Payload validation
// ---------------------------------------------------------------------------

export function parseFileImportChunk(data: unknown): FileImportChunkRequest {
  const payload = parseObject(data, 'data');

  if (typeof payload.importId !== 'string' || !FILE_IMPORT_ID_PATTERN.test(payload.importId)) {
    throw new HttpsError(
      'invalid-argument',
      'importId must be 8–64 characters of letters, digits or dashes.'
    );
  }
  if (!Array.isArray(payload.shows) || !Array.isArray(payload.movies)) {
    throw new HttpsError('invalid-argument', 'shows and movies must be arrays.');
  }
  if (payload.shows.length + payload.movies.length > FILE_IMPORT_MAX_ENTITIES_PER_CHUNK) {
    throw new HttpsError('invalid-argument', 'Chunk size exceeds the supported maximum.');
  }

  const shows = payload.shows.map((show, index) => parseShow(show, `shows[${index}]`));
  const movies = payload.movies.map((movie, index) => parseMovie(movie, `movies[${index}]`));
  const totalPlays = shows.reduce((total, show) => total + show.plays.length, 0);

  if (totalPlays > FILE_IMPORT_MAX_PLAYS_PER_CHUNK) {
    throw new HttpsError(
      'invalid-argument',
      `Chunk exceeds the supported maximum of ${FILE_IMPORT_MAX_PLAYS_PER_CHUNK} episode plays.`
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

function parseShow(raw: unknown, path: string): FileImportShowEntity {
  const show = parseObject(raw, path);
  const status = show.status ?? null;

  if (status !== null && !SHOW_STATUSES.includes(status as FileImportShowStatus)) {
    throw new HttpsError(
      'invalid-argument',
      `${path}.status must be one of ${SHOW_STATUSES.join(', ')} or null.`
    );
  }
  if (!Array.isArray(show.plays)) {
    throw new HttpsError('invalid-argument', `${path}.plays must be an array.`);
  }

  const entity: FileImportShowEntity = {
    addedAt: parseTimestamp(show.addedAt, `${path}.addedAt`),
    favorite: parseBoolean(show.favorite, `${path}.favorite`),
    imdbId: parseImdbId(show.imdbId, `${path}.imdbId`),
    lists: parseLists(show.lists, `${path}.lists`),
    plays: show.plays.map((play, index) => parsePlay(play, `${path}.plays[${index}]`)),
    rating: parseRating(show.rating, `${path}.rating`),
    status: status as FileImportShowStatus | null,
    title: parseTitle(show.title, `${path}.title`),
    tvdbId: parseOptionalPositiveInt(show.tvdbId, `${path}.tvdbId`),
  };

  if (show.part !== undefined) {
    const part = parseObject(show.part, `${path}.part`);
    const total = parseIntInRange(part.total, `${path}.part.total`, 1, 1000);
    entity.part = { index: parseIntInRange(part.index, `${path}.part.index`, 0, total - 1), total };
  }

  // Optional fields only Simkl sends; absent fields leave the entity exactly as before.
  if (show.tmdbId !== undefined && show.tmdbId !== null) {
    entity.tmdbId = parseIntInRange(show.tmdbId, `${path}.tmdbId`, 1, Number.MAX_SAFE_INTEGER);
  }
  if (show.year !== undefined && show.year !== null) {
    entity.year = parseIntInRange(show.year, `${path}.year`, 1870, 2100);
  }
  if (show.watchedThrough !== undefined) {
    entity.watchedThrough = parseWatchedThrough(show.watchedThrough, `${path}.watchedThrough`);
  }
  if (show.watchedThroughAt !== undefined) {
    entity.watchedThroughAt = parseTimestamp(show.watchedThroughAt, `${path}.watchedThroughAt`);
  }
  if (show.anime !== undefined) {
    entity.anime = parseAnimeNumbering(show.anime, `${path}.anime`);
  }

  // A TMDB id identifies the show on its own; otherwise the original rule applies.
  if (entity.tmdbId === undefined) {
    assertHasIdentifier(entity, path);
  }
  return entity;
}

function parseWatchedThrough(raw: unknown, path: string): FileImportWatchedThrough {
  const through = parseObject(raw, path);
  if (through.kind === 'all') {
    return { kind: 'all' };
  }
  if (through.kind === 'through') {
    return {
      episode: parseIntInRange(through.episode, `${path}.episode`, 1, MAX_EPISODE_NUMBER),
      kind: 'through',
      season: parseIntInRange(through.season, `${path}.season`, 1, MAX_EPISODE_NUMBER),
    };
  }
  throw new HttpsError('invalid-argument', `${path}.kind must be "all" or "through".`);
}

function parseAnimeNumbering(raw: unknown, path: string): FileImportAnimeNumbering {
  const anime = parseObject(raw, path);
  return {
    entryEpisodeTotal:
      anime.entryEpisodeTotal === null || anime.entryEpisodeTotal === undefined
        ? null
        : parseIntInRange(
            anime.entryEpisodeTotal,
            `${path}.entryEpisodeTotal`,
            1,
            MAX_EPISODE_NUMBER
          ),
    groupedEntries: parseIntInRange(anime.groupedEntries, `${path}.groupedEntries`, 1, 100),
  };
}

function parseMovie(raw: unknown, path: string): FileImportMovieEntity {
  const movie = parseObject(raw, path);

  if (!Array.isArray(movie.watches) || movie.watches.length > FILE_IMPORT_MAX_MOVIE_WATCHES) {
    throw new HttpsError(
      'invalid-argument',
      `${path}.watches must be an array of at most ${FILE_IMPORT_MAX_MOVIE_WATCHES} timestamps.`
    );
  }

  const entity: FileImportMovieEntity = {
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

function parsePlay(raw: unknown, path: string): FileImportEpisodePlay {
  const play = parseObject(raw, path);
  const parsed: FileImportEpisodePlay = {
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

function parseLists(raw: unknown, path: string): FileImportListMembership[] {
  if (!Array.isArray(raw) || raw.length > FILE_IMPORT_MAX_LISTS_PER_ENTITY) {
    throw new HttpsError(
      'invalid-argument',
      `${path} must be an array of at most ${FILE_IMPORT_MAX_LISTS_PER_ENTITY} lists.`
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

function parseRating(raw: unknown, path: string): FileImportRating | null {
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
