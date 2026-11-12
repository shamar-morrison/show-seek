/**
 * Contract between the app (which parses export files on-device) and the chunked
 * file-import callables (`importTvTimeChunk`, and later other sources). Imported by
 * both sides — keep it dependency-free.
 *
 * `shared/tvtimeImport.ts` re-exports everything here under its original TV Time
 * names, so existing TV Time code keeps compiling unchanged.
 */

export const FILE_IMPORT_MAX_ENTITIES_PER_CHUNK = 15;
export const FILE_IMPORT_MAX_PLAYS_PER_CHUNK = 1500;
export const FILE_IMPORT_MAX_MOVIE_WATCHES = 100;
export const FILE_IMPORT_MAX_LISTS_PER_ENTITY = 50;
export const FILE_IMPORT_MAX_UNRESOLVED_TITLES_PER_CHUNK = 25;
/** Season + episode ratings per chunk (and per show): each is one rating write. */
export const FILE_IMPORT_MAX_DETAIL_RATINGS_PER_CHUNK = 1500;
/** Highest season or episode number the server accepts. */
export const FILE_IMPORT_MAX_EPISODE_NUMBER = 10_000;

// Abuse limits, enforced server-side per user and per source (see `claimImportChunkSlot`).
// Modelled on the Trakt ZIP import: one import at a time + a 6h cooldown. Because
// only the client knows when a chunked import ends, the cooldown runs from the
// import's *start*; chunks that reuse the same importId always continue it.
export const FILE_IMPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** Cooldown for the emulator and allowlisted testers (TRAKT_SYNC_BYPASS_UIDS), as in the Trakt import. */
export const TEST_FILE_IMPORT_COOLDOWN_MS = 10 * 1000;
/** An import with no chunk for this long no longer blocks a new one. */
export const FILE_IMPORT_SESSION_STALE_MS = 15 * 60 * 1000;
/** After this, even the same importId starts a new import (subject to the cooldown). */
export const FILE_IMPORT_SESSION_MAX_LIFETIME_MS = 24 * 60 * 60 * 1000;
export const FILE_IMPORT_MAX_CHUNKS_PER_SESSION = 600;
/** The client sends chunks sequentially; this only stops scripted bursts. */
export const FILE_IMPORT_MAX_CALLS_PER_MINUTE = 30;
export const FILE_IMPORT_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

/**
 * `details` of the HttpsError thrown when a chunk is refused:
 * - `burst` / `cooldown` / `session_chunks` → code `resource-exhausted`
 * - `in_progress` (another import is still active) → code `already-exists`
 */
export interface FileImportRateLimitDetails {
  reason: 'burst' | 'cooldown' | 'in_progress' | 'session_chunks';
  retryAfterMs: number | null;
  /** ISO timestamp, set for `cooldown` (mirrors the Trakt import's error details). */
  nextAllowedImportAt?: string;
}

/** users/{uid}/import_limits/{source} — written by the server only, readable by the owner. */
export interface FileImportLimitDoc {
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
export const FILE_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL = 200;

/**
 * `following` (Showly's "My Shows", which has no completed state): the server picks
 * Already Watched when the show has ended and every aired regular-season episode is
 * tracked, otherwise Watching. Decided on the show's last part.
 */
export type FileImportShowStatus =
  | 'watchlist'
  | 'watching'
  | 'up_to_date'
  | 'dropped'
  | 'following';

export interface FileImportRating {
  /** ShowSeek scale, 1–10. Converted from the source's scale on the client. */
  value: number;
  ratedAt: number;
}

/** A season rating (Showly). Season numbers are the source's; checked against TMDB. */
export interface FileImportSeasonRating {
  season: number;
  value: number;
  ratedAt: number;
}

/** An episode rating (Showly), by season and episode number. */
export interface FileImportEpisodeRating {
  season: number;
  episode: number;
  value: number;
  ratedAt: number;
}

export interface FileImportListMembership {
  name: string;
  addedAt: number;
  /** The list's description (Showly). Written only on a list the import creates. */
  description?: string;
}

/** Same cap as the app's list description field (CreateListModal / RenameListModal). */
export const FILE_IMPORT_MAX_LIST_DESCRIPTION_LENGTH = 120;

export interface FileImportEpisodePlay {
  season: number;
  episode: number;
  /** TVDB episode id (e.g. TV Time GDPR v2 `ep_id`); used to repair TVDB/TMDB numbering mismatches. */
  tvdbEpisodeId?: number;
  watchedAt: number;
}

/**
 * Episodes known only as "watched up to here" (a Simkl entry without an episode list):
 * `all` = every aired regular-season episode, `through` = up to and including S/E.
 * For anime entities the coordinates are in the entry's own numbering (season 1).
 */
export type FileImportWatchedThrough =
  | { kind: 'all' }
  | { kind: 'through'; season: number; episode: number };

/**
 * Set on anime entities, whose plays use the source entry's own numbering (season 1,
 * episodes 1…n) rather than TMDB seasons. See `mapAnimePlays` in the server core.
 */
export interface FileImportAnimeNumbering {
  /** The entry's total episode count, used to check it lines up with TMDB. */
  entryEpisodeTotal: number | null;
  /** How many source entries (e.g. broadcast cours) were grouped into this show. */
  groupedEntries: number;
}

export interface FileImportShowEntity {
  /** Tried before tvdbId/imdbId when present (Simkl, Showly). Enough on its own to identify the show. */
  tmdbId?: number;
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  /** First-air year, used by title search when the title has no "(YYYY)" suffix (Simkl). */
  year?: number | null;
  status: FileImportShowStatus | null;
  favorite: boolean;
  rating: FileImportRating | null;
  lists: FileImportListMembership[];
  /** Used as `addedAt` for status/favorite list memberships. */
  addedAt: number;
  plays: FileImportEpisodePlay[];
  /** Set when a long show is split across chunks; list/status/rating are written for part 0 only. */
  part?: { index: number; total: number };
  /** Episodes known only as a "watched up to" point; expanded on the server. Explicit plays win. */
  watchedThrough?: FileImportWatchedThrough;
  /** The one date stamped on expanded episodes. Without it, `watchedThrough` is ignored. */
  watchedThroughAt?: number;
  anime?: FileImportAnimeNumbering;
  /** Season ratings (Showly); written from part 0, never over an existing rating. */
  seasonRatings?: FileImportSeasonRating[];
  /** Episode ratings (Showly); written from part 0, never over an existing rating. */
  episodeRatings?: FileImportEpisodeRating[];
}

export interface FileImportMovieEntity {
  /** Resolved directly when present (e.g. TV Time's Data Extractor CSV carries TMDB ids). */
  tmdbId?: number;
  tvdbId: number | null;
  imdbId: string | null;
  title: string;
  /** Secondary search query, e.g. the English slug from a TV Time GDPR export. */
  altTitle?: string;
  year: number | null;
  /** One entry per play, epoch ms. */
  watches: number[];
  watchlist: boolean;
  favorite: boolean;
  rating: FileImportRating | null;
  lists: FileImportListMembership[];
  addedAt: number;
}

export interface FileImportChunkRequest {
  /** Client-generated id for one import run; reuse it when retrying chunks of the same run. */
  importId: string;
  shows: FileImportShowEntity[];
  movies: FileImportMovieEntity[];
  /** True on the last chunk the client sends in a run, so the server can mark the import finished. */
  final?: boolean;
}

export type FileImportSkipReason =
  // Client-side (file parsing)
  | 'malformed_row'
  | 'invalid_date'
  | 'missing_identifiers'
  // Server-side (TMDB resolution)
  | 'unresolved_show'
  | 'unresolved_movie'
  | 'ambiguous_title'
  | 'unmatched_episode'
  /** Anime episode that can't be placed on TMDB's seasons without an unlicensed mapping. */
  | 'unmatched_anime_episode'
  // Server-side (existing ShowSeek data is never overwritten)
  | 'already_tracked_episode'
  | 'already_tracked_movie'
  | 'existing_rating';

export type FileImportIgnoredReason =
  | 'rewatched_episodes'
  | 'episode_ratings'
  /** Client-side: identical plays (same episode, same timestamp) collapsed. */
  | 'duplicate_plays'
  /** Client-side: episode rows with no usable show ids (e.g. TV Time Data Extractor). */
  | 'unsupported_episodes'
  /** Client-side (Simkl): OVA/ONA/special/music-video anime entries. */
  | 'anime_extras'
  /** Client-side (Simkl): dropped movies (the contract has no movie status). */
  | 'dropped_movies'
  /** Client-side (Simkl): shows whose episodes are known only as a "watched up to" point. */
  | 'summary_only_episodes'
  /** Client-side (Showly): hidden movies (the contract has no movie status). */
  | 'hidden_movies'
  /** Client-side (Showly): pinned titles (ShowSeek has no pinning). */
  | 'pinned_items'
  /** Client-side (Showly): custom-list items that aren't a show or movie. */
  | 'non_media_list_items';

/** Ignored reasons only the Showly client reports. */
export type ShowlyOnlyIgnoredReason = 'hidden_movies' | 'pinned_items' | 'non_media_list_items';

export interface FileImportCounts {
  shows: number;
  movies: number;
  watchedEpisodes: number;
  watchedMovies: number;
  ratings: number;
  listItems: number;
  customListsCreated: number;
}

export interface FileImportStats {
  imported: FileImportCounts;
  skipped: Partial<Record<FileImportSkipReason, number>>;
  ignored: Partial<Record<FileImportIgnoredReason, number>>;
  unresolvedTitles: string[];
  /**
   * Shows that had episodes the server couldn't place, so the summary can name them.
   * Only sources with `reportUnmatchedEpisodeTitles` set it; absent otherwise.
   */
  unmatchedEpisodeTitles?: string[];
  processedEntities: number;
}

export type FileImportChunkResult = FileImportStats;

export const createEmptyFileImportCounts = (): FileImportCounts => ({
  customListsCreated: 0,
  listItems: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchedEpisodes: 0,
  watchedMovies: 0,
});

export const createEmptyFileImportStats = (): FileImportStats => ({
  ignored: {},
  imported: createEmptyFileImportCounts(),
  processedEntities: 0,
  skipped: {},
  unresolvedTitles: [],
});

export const mergeFileImportStats = (
  base: FileImportStats,
  incoming: FileImportStats
): FileImportStats => {
  const imported = { ...base.imported };
  (Object.keys(imported) as (keyof FileImportCounts)[]).forEach((key) => {
    imported[key] += incoming.imported[key] ?? 0;
  });

  const merged: FileImportStats = {
    ignored: mergeCountMaps(base.ignored, incoming.ignored),
    imported,
    processedEntities: base.processedEntities + incoming.processedEntities,
    skipped: mergeCountMaps(base.skipped, incoming.skipped),
    unresolvedTitles: Array.from(
      new Set([...base.unresolvedTitles, ...incoming.unresolvedTitles])
    ).slice(0, FILE_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL),
  };
  // Only present when a side reported it, so TV Time's stats keep their exact shape.
  if (base.unmatchedEpisodeTitles || incoming.unmatchedEpisodeTitles) {
    merged.unmatchedEpisodeTitles = Array.from(
      new Set([...(base.unmatchedEpisodeTitles ?? []), ...(incoming.unmatchedEpisodeTitles ?? [])])
    ).slice(0, FILE_IMPORT_MAX_UNRESOLVED_TITLES_TOTAL);
  }
  return merged;
};

export const incrementFileImportStat = <T extends string>(
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
