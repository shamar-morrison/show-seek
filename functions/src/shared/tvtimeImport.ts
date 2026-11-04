/**
 * Contract between the app (which parses TV Time exports on-device) and the
 * `importTvTimeChunk` callable. Imported by both sides — keep it dependency-free.
 */

export const TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK = 15;
export const TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK = 1500;
export const TVTIME_IMPORT_MAX_MOVIE_WATCHES = 100;
export const TVTIME_IMPORT_MAX_LISTS_PER_ENTITY = 50;
export const TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK = 25;

// Abuse limits, enforced server-side per user (see `claimTvTimeChunkSlot`).
// Modelled on the Trakt ZIP import: one import at a time + a 6h cooldown. Because
// only the client knows when a chunked import ends, the cooldown runs from the
// import's *start*; chunks that reuse the same importId always continue it.
export const TVTIME_IMPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Cooldown for the emulator and allowlisted testers (TRAKT_SYNC_BYPASS_UIDS), as in the Trakt import. */
export const TEST_TVTIME_IMPORT_COOLDOWN_MS = 10 * 1000;
/** An import with no chunk for this long no longer blocks a new one. */
export const TVTIME_IMPORT_SESSION_STALE_MS = 15 * 60 * 1000;
/** After this, even the same importId starts a new import (subject to the cooldown). */
export const TVTIME_IMPORT_SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const TVTIME_IMPORT_MAX_CHUNKS_PER_SESSION = 600;
/** The client sends chunks sequentially; this only stops scripted bursts. */
export const TVTIME_IMPORT_MAX_CALLS_PER_MINUTE = 30;
export const TVTIME_IMPORT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * `details` of the HttpsError thrown when a chunk is refused:
 * - `burst` / `cooldown` / `session_chunks` → code `resource-exhausted`
 * - `in_progress` (another import is still active) → code `already-exists`
 */
export interface TvTimeRateLimitDetails {
  reason: 'burst' | 'cooldown' | 'in_progress' | 'session_chunks';
  retryAfterMs: number | null;
  /** ISO timestamp, set for `cooldown` (mirrors the Trakt import's error details). */
  nextAllowedImportAt?: string;
}

/** users/{uid}/import_limits/tvtime — written by the server only, readable by the owner. */
export interface TvTimeImportLimitDoc {
  recentCalls: number[];
  session: {
    id: string;
    startedAt: number;
    lastChunkAt: number;
    chunks: number;
    /** When a *different* import may start. */
    nextAllowedImportAt: number;
    /** Set once the client's last chunk succeeds; a finished import no longer blocks a new one. */
    finishedAt: number | null;
  };
  updatedAt: number;
}
/** Client-side cap when merging unresolved titles across chunks for the summary screen. */
export const TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL = 200;

export type TvTimeShowStatus = 'watchlist' | 'watching' | 'up_to_date' | 'dropped';

export interface TvTimeRating {
  /** ShowSeek scale, 1–10. Converted from TV Time's scale on the client. */
  value: number;
  ratedAt: number;
}

export interface TvTimeListMembership {
  name: string;
  addedAt: number;
}

export interface TvTimeEpisodePlay {
  season: number;
  episode: number;
  /** TVDB episode id (GDPR v2 `ep_id`); used to repair TVDB/TMDB numbering mismatches. */
  tvdbEpisodeId?: number;
  watchedAt: number;
}

export interface TvTimeShowEntity {
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  status: TvTimeShowStatus | null;
  favorite: boolean;
  rating: TvTimeRating | null;
  lists: TvTimeListMembership[];
  /** Used as `addedAt` for status/favorite list memberships. */
  addedAt: number;
  plays: TvTimeEpisodePlay[];
  /** Set when a long show is split across chunks; list/status/rating are written for part 0 only. */
  part?: { index: number; total: number };
}

export interface TvTimeMovieEntity {
  /** Only the Data Extractor CSV carries TMDB ids; resolved directly when present. */
  tmdbId?: number;
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  /** Secondary search query, e.g. the English slug from a GDPR export. */
  altTitle?: string;
  year: number | null;
  /** One entry per play, epoch ms. */
  watches: number[];
  watchlist: boolean;
  favorite: boolean;
  rating: TvTimeRating | null;
  lists: TvTimeListMembership[];
  addedAt: number;
}

export interface TvTimeImportChunkRequest {
  /** Client-generated id for one import run; reuse it when retrying chunks of the same run. */
  importId: string;
  shows: TvTimeShowEntity[];
  movies: TvTimeMovieEntity[];
  /** True on the last chunk the client sends in a run, so the server can mark the import finished. */
  final?: boolean;
}

export type TvTimeSkipReason =
  // Client-side (file parsing)
  | 'malformed_row'
  | 'invalid_date'
  | 'missing_identifiers'
  // Server-side (TMDB resolution)
  | 'unresolved_show'
  | 'unresolved_movie'
  | 'ambiguous_title'
  | 'unmatched_episode'
  // Server-side (existing ShowSeek data is never overwritten)
  | 'already_tracked_episode'
  | 'already_tracked_movie'
  | 'existing_rating';

export type TvTimeIgnoredReason =
  | 'rewatched_episodes'
  | 'episode_ratings'
  /** Client-side: identical plays (same episode, same timestamp) collapsed. */
  | 'duplicate_plays'
  /** Client-side: Data Extractor episode rows, which carry no usable show ids. */
  | 'unsupported_episodes';

export interface TvTimeImportCounts {
  shows: number;
  movies: number;
  watchedEpisodes: number;
  watchedMovies: number;
  ratings: number;
  listItems: number;
  customListsCreated: number;
}

export interface TvTimeImportStats {
  imported: TvTimeImportCounts;
  skipped: Partial<Record<TvTimeSkipReason, number>>;
  ignored: Partial<Record<TvTimeIgnoredReason, number>>;
  unresolvedTitles: string[];
  processedEntities: number;
}

export type TvTimeImportChunkResult = TvTimeImportStats;

export const createEmptyTvTimeImportCounts = (): TvTimeImportCounts => ({
  customListsCreated: 0,
  listItems: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchedEpisodes: 0,
  watchedMovies: 0,
});

export const createEmptyTvTimeImportStats = (): TvTimeImportStats => ({
  ignored: {},
  imported: createEmptyTvTimeImportCounts(),
  processedEntities: 0,
  skipped: {},
  unresolvedTitles: [],
});

export const mergeTvTimeImportStats = (
  base: TvTimeImportStats,
  incoming: TvTimeImportStats
): TvTimeImportStats => {
  const imported = { ...base.imported };
  (Object.keys(imported) as (keyof TvTimeImportCounts)[]).forEach((key) => {
    imported[key] += incoming.imported[key] ?? 0;
  });

  return {
    ignored: mergeCountMaps(base.ignored, incoming.ignored),
    imported,
    processedEntities: base.processedEntities + incoming.processedEntities,
    skipped: mergeCountMaps(base.skipped, incoming.skipped),
    unresolvedTitles: Array.from(
      new Set([...base.unresolvedTitles, ...incoming.unresolvedTitles])
    ).slice(0, TVTIME_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL),
  };
};

export const incrementTvTimeStat = <T extends string>(
  stats: Partial<Record<T, number>>,
  key: T,
  amount = 1
): Partial<Record<T, number>> => ({
  ...stats,
  [key]: (stats[key] ?? 0) + amount,
});

function mergeCountMaps<T extends string>(
  base: Partial<Record<T, number>>,
  incoming: Partial<Record<T, number>>
): Partial<Record<T, number>> {
  const result: Partial<Record<T, number>> = { ...base };

  Object.entries(incoming).forEach(([key, value]) => {
    if (typeof value !== 'number') {
      return;
    }

    const typedKey = key as T;
    result[typedKey] = (result[typedKey] ?? 0) + value;
  });

  return result;
}
