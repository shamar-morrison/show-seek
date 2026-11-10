import {
  createEmptyFileImportStats,
  incrementFileImportStat,
  type FileImportEpisodePlay,
  type FileImportIgnoredReason,
  type FileImportMovieEntity,
  type FileImportRating,
  type FileImportShowEntity,
  type FileImportShowStatus,
  type FileImportSkipReason,
  type FileImportStats,
  type FileImportWatchedThrough,
} from '@/functions/src/shared/fileImport';
import { toImdbId, toNonNegativeInt, toPositiveInt, toRating } from '../../tvtimeImport/values';
import { SimklImportError } from '../files';
import { parseEpisodeLabel, parseSimklDate } from '../values';

/**
 * Parses `SimklBackup.json` — Simkl's backup, which has the structure of its
 * `/sync/all-items?extended=full&episode_watched_at=yes` API response — and third-party
 * exports with the same structure. See docs/simkl-import-plan.md for every rule here.
 */

type Json = Record<string, unknown>;

export interface ParsedSimklBackup {
  shows: FileImportShowEntity[];
  movies: FileImportMovieEntity[];
  /**
   * Episodes the server will write for each show (plays + expected "watched up to"
   * expansion), aligned with `shows`. Only used to size chunks.
   */
  showWeights: number[];
  /** Client-side skipped/ignored counts. */
  stats: FileImportStats;
}

const MAX_TITLE_LENGTH = 500;

const SHOW_STATUS: Record<string, FileImportShowStatus> = {
  completed: 'up_to_date',
  dropped: 'dropped',
  // ShowSeek has no on-hold list; the user meant to come back.
  hold: 'watching',
  notinteresting: 'dropped',
  plantowatch: 'watchlist',
  watching: 'watching',
};
const DROPPED = new Set(['dropped', 'notinteresting']);
const ANIME_EXTRA_TYPES = new Set(['ova', 'ona', 'special', 'music video']);

class Tally {
  readonly stats = createEmptyFileImportStats();
  skip(reason: FileImportSkipReason, amount = 1): void {
    if (amount > 0)
      this.stats.skipped = incrementFileImportStat(this.stats.skipped, reason, amount);
  }
  ignore(reason: FileImportIgnoredReason, amount = 1): void {
    if (amount > 0)
      this.stats.ignored = incrementFileImportStat(this.stats.ignored, reason, amount);
  }
}

export function parseSimklBackupJson(text: string, now: number): ParsedSimklBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new SimklImportError('unreadable_file');
  }
  if (!isObject(data)) {
    throw new SimklImportError('unknown_format');
  }
  const hasSimklKeys = ['shows', 'anime', 'movies'].some((key) => key in data);
  // Simkl writes `{}` for an empty library; anything else without its keys isn't Simkl.
  if (!hasSimklKeys && Object.keys(data).length > 0) {
    throw new SimklImportError('unknown_format');
  }

  const tally = new Tally();
  const shows: FileImportShowEntity[] = [];
  const showWeights: number[] = [];
  const movies: FileImportMovieEntity[] = [];

  for (const rows of groupRows(arrayOf(data.shows), 'show')) {
    const show = toShow(rows, false, now, tally);
    if (show) {
      shows.push(show.entity);
      showWeights.push(show.weight);
    }
  }

  const animeShows: { entity: FileImportShowEntity; weight: number; rows: Json[] }[] = [];
  for (const rows of groupRows(arrayOf(data.anime), 'show')) {
    const type = String(rows[0].anime_type ?? 'tv').toLowerCase();
    if (type === 'movie') {
      const movie = toMovie(rows, 'show', now, tally);
      if (movie) movies.push(movie);
    } else if (ANIME_EXTRA_TYPES.has(type)) {
      tally.ignore('anime_extras');
    } else {
      const show = toShow(rows, true, now, tally);
      if (show) animeShows.push({ ...show, rows });
    }
  }
  for (const group of groupAnimeCours(animeShows)) {
    shows.push(group.entity);
    showWeights.push(group.weight);
  }

  for (const rows of groupRows(arrayOf(data.movies), 'movie')) {
    const movie = toMovie(rows, 'movie', now, tally);
    if (movie) movies.push(movie);
  }

  if (shows.length === 0 && movies.length === 0) {
    throw new SimklImportError('no_history');
  }
  return { movies, showWeights, shows, stats: tally.stats };
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Groups a title's rows: VIP backups add one row per rewatch session (`is_rewatch: true`)
 * next to the main row. The main row comes first.
 */
function groupRows(rows: unknown[], mediaKey: 'show' | 'movie'): Json[][] {
  const groups = new Map<string, Json[]>();
  rows.filter(isObject).forEach((row, index) => {
    const media = objectOf(row[mediaKey]);
    const simklId = toPositiveInt(objectOf(media.ids).simkl);
    const key = simklId !== null ? `id:${simklId}` : `row:${index}`;
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) =>
    [...group].sort(
      (left, right) => Number(left.is_rewatch === true) - Number(right.is_rewatch === true)
    )
  );
}

interface Identity {
  title: string;
  year: number | null;
  tmdbId: number | null;
  tvdbId: number | null;
  imdbId: string | null;
}

function identityOf(media: Json): Identity {
  const ids = objectOf(media.ids);
  const year = toPositiveInt(media.year);
  return {
    imdbId: toImdbId(ids.imdb),
    title: typeof media.title === 'string' ? media.title.trim().slice(0, MAX_TITLE_LENGTH) : '',
    tmdbId: toPositiveInt(ids.tmdb),
    tvdbId: toPositiveInt(ids.tvdb),
    year: year !== null && year >= 1870 && year <= 2100 ? year : null,
  };
}

function hasIdentifier(identity: Identity): boolean {
  return (
    identity.tmdbId !== null ||
    identity.tvdbId !== null ||
    identity.imdbId !== null ||
    !!identity.title
  );
}

function ratingOf(row: Json, now: number): FileImportRating | null {
  const value = toRating(typeof row.user_rating === 'number' ? row.user_rating : null);
  if (value === null) return null;
  const ratedAt =
    parseSimklDate(row.user_rated_at, now) ??
    parseSimklDate(row.last_watched_at, now) ??
    parseSimklDate(row.added_to_watchlist_at, now) ??
    now;
  return { ratedAt, value };
}

function addedAtOf(row: Json, now: number): number {
  return (
    parseSimklDate(row.added_to_watchlist_at, now) ??
    parseSimklDate(row.last_watched_at, now) ??
    now
  );
}

// ---------------------------------------------------------------------------
// Shows and anime
// ---------------------------------------------------------------------------

function toShow(
  rows: Json[],
  isAnime: boolean,
  now: number,
  tally: Tally
): { entity: FileImportShowEntity; weight: number } | null {
  const main = rows[0];
  const identity = identityOf(objectOf(main.show));
  if (!hasIdentifier(identity)) {
    tally.skip('missing_identifiers');
    return null;
  }

  // Every session's episodes (rewatches included); the server keeps the latest per episode.
  const plays = dedupePlays(
    rows.flatMap((row) => playsOf(row, now, tally)),
    tally
  );

  const status = typeof main.status === 'string' ? main.status.toLowerCase() : '';
  const watchedCount = toNonNegativeInt(main.watched_episodes_count);
  const listedCount = countListed(main);
  let watchedThrough: FileImportWatchedThrough | undefined;
  if (watchedCount !== null && watchedCount > listedCount) {
    // More episodes watched than listed: a completed entry without (all of) its
    // episode list, or a summary-only third-party export.
    const label = parseEpisodeLabel(main.last_watched);
    if (status === 'completed') {
      watchedThrough = { kind: 'all' };
    } else if (label && listedCount === 0) {
      watchedThrough = { episode: label.episode, kind: 'through', season: label.season };
    }
  }

  const entity: FileImportShowEntity = {
    addedAt: addedAtOf(main, now),
    favorite: false,
    imdbId: identity.imdbId,
    lists: [],
    plays,
    rating: ratingOf(main, now),
    status: SHOW_STATUS[status] ?? null,
    title: identity.title,
    tvdbId: identity.tvdbId,
  };
  if (identity.tmdbId !== null) entity.tmdbId = identity.tmdbId;
  if (identity.year !== null) entity.year = identity.year;
  if (watchedThrough) {
    entity.watchedThrough = watchedThrough;
    const watchedThroughAt = parseSimklDate(main.last_watched_at, now);
    if (watchedThroughAt !== null) entity.watchedThroughAt = watchedThroughAt;
    tally.ignore('summary_only_episodes');
  }
  if (isAnime) {
    entity.anime = {
      entryEpisodeTotal: toPositiveInt(main.total_episodes_count),
      groupedEntries: 1,
    };
  }

  const expected = watchedThrough ? Math.max(0, (watchedCount ?? 0) - plays.length) : 0;
  return { entity, weight: plays.length + expected };
}

function countListed(row: Json): number {
  return arrayOf(row.seasons).reduce<number>(
    (total, season) => total + arrayOf(objectOf(season).episodes).length,
    0
  );
}

/**
 * A row's episode plays. When the list holds no more episodes than the row says were
 * watched, every listed episode was watched (exports made without per-episode dates
 * list only watched ones); undated or "I don't remember" ones take the row's
 * last-watched date. When it lists more, the extras are unwatched and only dated
 * episodes count.
 */
function playsOf(row: Json, now: number, tally: Tally): FileImportEpisodePlay[] {
  const watchedCount = toNonNegativeInt(row.watched_episodes_count);
  const listedAreWatched = watchedCount === null || countListed(row) <= watchedCount;
  const fallback =
    parseSimklDate(row.last_watched_at, now) ?? parseSimklDate(row.added_to_watchlist_at, now);
  const plays: FileImportEpisodePlay[] = [];

  for (const rawSeason of arrayOf(row.seasons)) {
    const season = objectOf(rawSeason);
    const seasonNumber = toNonNegativeInt(season.number);
    for (const rawEpisode of arrayOf(season.episodes)) {
      const episode = objectOf(rawEpisode);
      const episodeNumber = toNonNegativeInt(episode.number);
      if (seasonNumber === null || episodeNumber === null) {
        tally.skip('malformed_row');
        continue;
      }
      const watchedAt = parseSimklDate(episode.watched_at, now);
      if (watchedAt === null && !listedAreWatched) {
        continue; // listed but not watched
      }
      const at = watchedAt ?? fallback;
      if (at === null) {
        tally.skip('invalid_date');
        continue;
      }
      const play: FileImportEpisodePlay = {
        episode: episodeNumber,
        season: seasonNumber,
        watchedAt: at,
      };
      const tvdbEpisodeId = toPositiveInt(objectOf(episode.ids).tvdb_id);
      if (tvdbEpisodeId !== null) play.tvdbEpisodeId = tvdbEpisodeId;
      plays.push(play);
    }
  }
  return plays;
}

function dedupePlays(plays: FileImportEpisodePlay[], tally: Tally): FileImportEpisodePlay[] {
  const seen = new Set<string>();
  const unique = plays.filter((play) => {
    const key = `${play.season}_${play.episode}_${play.watchedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  tally.ignore('duplicate_plays', plays.length - unique.length);
  return unique.sort(
    (left, right) =>
      left.season - right.season || left.episode - right.episode || left.watchedAt - right.watchedAt
  );
}

/**
 * Simkl splits many anime into one entry per broadcast season (cour), and cours of one
 * series can share the parent's TMDB/TVDB id. Those are merged into one show at show
 * level only: their episodes use each entry's own numbering, which can't be placed on
 * TMDB without an unlicensed mapping, so the server reports them as unmatched.
 * Status and rating come from the entry with the latest activity.
 */
function groupAnimeCours(
  entries: { entity: FileImportShowEntity; weight: number; rows: Json[] }[]
): { entity: FileImportShowEntity; weight: number }[] {
  const groups = new Map<string, typeof entries>();
  entries.forEach((entry, index) => {
    const { tmdbId, tvdbId } = entry.entity;
    const key =
      tmdbId !== undefined ? `tmdb:${tmdbId}` : tvdbId !== null ? `tvdb:${tvdbId}` : `own:${index}`;
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  });

  return [...groups.values()].map((group) => {
    if (group.length === 1) return group[0];
    // Latest watch first; when-added only breaks ties (e.g. nothing watched yet).
    const lastWatch = (entry: (typeof group)[number]) =>
      Math.max(
        0,
        ...entry.entity.plays.map((play) => play.watchedAt),
        entry.entity.watchedThroughAt ?? 0
      );
    const latest = [...group].sort(
      (left, right) =>
        lastWatch(right) - lastWatch(left) || right.entity.addedAt - left.entity.addedAt
    )[0];
    const plays = group.flatMap((entry) => entry.entity.plays);
    const entity: FileImportShowEntity = {
      ...latest.entity,
      anime: { entryEpisodeTotal: null, groupedEntries: group.length },
      plays,
      rating:
        latest.entity.rating ?? group.find((entry) => entry.entity.rating)?.entity.rating ?? null,
    };
    // Each cour's "watched up to" is in its own numbering: nothing to expand at show level.
    delete entity.watchedThrough;
    delete entity.watchedThroughAt;
    return { entity, weight: plays.length };
  });
}

// ---------------------------------------------------------------------------
// Movies (including anime movies, which Simkl files under `anime` with a `show` object)
// ---------------------------------------------------------------------------

function toMovie(
  rows: Json[],
  mediaKey: 'show' | 'movie',
  now: number,
  tally: Tally
): FileImportMovieEntity | null {
  const main = rows[0];
  const status = typeof main.status === 'string' ? main.status.toLowerCase() : '';
  if (DROPPED.has(status)) {
    // The contract has no movie status to carry "dropped".
    tally.ignore('dropped_movies');
    return null;
  }
  const identity = identityOf(objectOf(main[mediaKey]));
  if (!hasIdentifier(identity)) {
    tally.skip('missing_identifiers');
    return null;
  }

  const watches = new Set<number>();
  if (status === 'completed') {
    for (const row of rows) {
      // The watch date, falling back to when it was added (Simkl's "marked as watched").
      const at =
        parseSimklDate(row.last_watched_at, now) ?? parseSimklDate(row.added_to_watchlist_at, now);
      if (at === null) {
        tally.skip('invalid_date');
      } else {
        watches.add(at);
      }
    }
  }

  const entity: FileImportMovieEntity = {
    addedAt: addedAtOf(main, now),
    favorite: false,
    imdbId: identity.imdbId,
    lists: [],
    rating: ratingOf(main, now),
    title: identity.title,
    // Simkl movie TVDB ids are TVDB *movie* ids, which TMDB's /find can't resolve.
    tvdbId: null,
    watches: [...watches].sort((left, right) => left - right),
    watchlist: status === 'plantowatch' || status === 'hold' || status === 'watching',
    year: identity.year,
  };
  if (identity.tmdbId !== null) entity.tmdbId = identity.tmdbId;

  if (entity.watches.length === 0 && !entity.watchlist && !entity.rating) {
    return null; // nothing to import
  }
  return entity;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectOf(value: unknown): Json {
  return isObject(value) ? value : {};
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
