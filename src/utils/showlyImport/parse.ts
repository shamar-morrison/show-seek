import {
  FILE_IMPORT_MAX_DETAIL_RATINGS_PER_CHUNK,
  FILE_IMPORT_MAX_EPISODE_NUMBER,
  FILE_IMPORT_MAX_LISTS_PER_ENTITY,
  FILE_IMPORT_MAX_LIST_DESCRIPTION_LENGTH,
  createEmptyFileImportStats,
  incrementFileImportStat,
  type FileImportEpisodePlay,
  type FileImportEpisodeRating,
  type FileImportIgnoredReason,
  type FileImportListMembership,
  type FileImportMovieEntity,
  type FileImportRating,
  type FileImportSeasonRating,
  type FileImportShowEntity,
  type FileImportShowStatus,
  type FileImportSkipReason,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { parseSimklDate } from '../simklImport/values';
import { toNonNegativeInt, toPositiveInt } from '../tvtimeImport/values';
import { ShowlyImportError } from './files';

/**
 * Parses a Showly backup (`showly_export_*.json`, schema v1 or v2). The format is read
 * from Showly's open-source exporter (GPL-3.0; format facts only, no code) and checked
 * against a real export. See docs/showly-import-plan.md for every rule here.
 *
 * Keys mean different things per section: `id` is a Trakt ID on shows, movies, episodes
 * and ratings but a local row ID on lists; `t` is a title on shows and movies but the
 * item type on list items. Null fields are left out of the file, `-1` (or 0) means an
 * unknown TMDB ID, and `1970-01-01T00:00:00Z` / `1969-12-31T23:59:59.999Z` mean no date.
 */

type Json = Record<string, unknown>;

export interface ParsedShowlyBackup {
  shows: FileImportShowEntity[];
  movies: FileImportMovieEntity[];
  /** Client-side skipped/ignored counts. */
  stats: FileImportStats;
  /** Custom lists in the file with no items (the contract creates lists through items). */
  emptyLists: number;
  /** Custom lists that have at least one importable item. */
  customLists: number;
}

const MAX_TITLE_LENGTH = 500;
const DEFAULT_LIST_NAME = 'Showly list';

/** Showly's own import order: a title already added from an earlier section is skipped. */
const SHOW_SECTIONS: [key: string, status: FileImportShowStatus][] = [
  ['cH', 'following'], // My Shows
  ['cW', 'watchlist'],
  ['cHid', 'dropped'], // Hidden
];

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

interface ShowAcc {
  tmdbId: number | null;
  title: string;
  status: FileImportShowStatus | null;
  addedAt: number | null;
  /** Stamped on episodes without a date: the show's `u`, then `a`. */
  fallbackDate: number | null;
  plays: Map<string, FileImportEpisodePlay>;
  rating: FileImportRating | null;
  seasonRatings: Map<number, FileImportSeasonRating>;
  episodeRatings: Map<string, FileImportEpisodeRating>;
  lists: Map<string, FileImportListMembership>;
}

interface MovieAcc {
  tmdbId: number | null;
  title: string;
  watchedAt: number | null;
  watchlist: boolean;
  addedAt: number | null;
  rating: FileImportRating | null;
  lists: Map<string, FileImportListMembership>;
}

interface Known {
  tmdbId: number | null;
  title: string;
}

export function parseShowlyBackup(text: string, now: number = Date.now()): ParsedShowlyBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ShowlyImportError('unreadable_file');
  }
  if (!isObject(data)) {
    throw new ShowlyImportError('unknown_format');
  }
  if (['shows', 'movies', 'anime'].some((key) => Array.isArray(data[key]))) {
    // Simkl's backup has the same top-level names, but as arrays.
    throw new ShowlyImportError('simkl_export');
  }
  const hasShowlySections = ['shows', 'movies', 'lists'].some((key) => isObject(data[key]));
  if (typeof data.version !== 'number' || !hasShowlySections) {
    throw new ShowlyImportError('unknown_format');
  }

  // Future watch dates are judged against when the backup was made, not today.
  const fileDate = parseSimklDate(data.createdAt, now);
  const reference = fileDate ?? now;
  const dateOf = (raw: unknown) => parseSimklDate(raw, reference);

  const tally = new Tally();
  const showsData = objectOf(data.shows);
  const moviesData = objectOf(data.movies);
  const lists = arrayOf(objectOf(data.lists).l).filter(isObject);

  // Trakt ID → TMDB ID / title, from every place the file pairs them. Shows and movies
  // have separate Trakt ID ranges.
  const knownShows = new Map<number, Known>();
  const knownMovies = new Map<number, Known>();
  const learn = (
    map: Map<number, Known>,
    traktRaw: unknown,
    tmdbRaw: unknown,
    titleRaw?: unknown
  ) => {
    const traktId = toId(traktRaw);
    if (traktId === null) return;
    const known = map.get(traktId) ?? { tmdbId: null, title: '' };
    known.tmdbId ??= toId(tmdbRaw);
    known.title ||= titleOf(titleRaw);
    map.set(traktId, known);
  };
  for (const [key] of SHOW_SECTIONS) {
    arrayOf(showsData[key])
      .filter(isObject)
      .forEach((row) => learn(knownShows, row.id, row.tmId, row.t));
  }
  arrayOf(showsData.pEp)
    .filter(isObject)
    .forEach((row) => learn(knownShows, row.sId, row.stmId));
  arrayOf(showsData.rS)
    .filter(isObject)
    .forEach((row) => learn(knownShows, row.id, row.tmId));
  for (const key of ['rSe', 'rEp']) {
    arrayOf(showsData[key])
      .filter(isObject)
      .forEach((row) => learn(knownShows, row.sId, row.stmId));
  }
  for (const key of ['cH', 'cW', 'cHid']) {
    arrayOf(moviesData[key])
      .filter(isObject)
      .forEach((row) => learn(knownMovies, row.id, row.tmId, row.t));
  }
  arrayOf(moviesData.rM)
    .filter(isObject)
    .forEach((row) => learn(knownMovies, row.id, row.tmId));
  for (const list of lists) {
    for (const item of arrayOf(list.it).filter(isObject)) {
      if (item.t === 'show') learn(knownShows, item.tId, item.tmId);
      if (item.t === 'movie') learn(knownMovies, item.tId, item.tmId);
    }
  }

  const shows = new Accumulator<ShowAcc>((known) => ({
    addedAt: null,
    fallbackDate: null,
    lists: new Map(),
    episodeRatings: new Map(),
    plays: new Map(),
    rating: null,
    seasonRatings: new Map(),
    status: null,
    tmdbId: known.tmdbId,
    title: known.title,
  }));
  const movies = new Accumulator<MovieAcc>((known) => ({
    addedAt: null,
    lists: new Map(),
    rating: null,
    title: known.title,
    tmdbId: known.tmdbId,
    watchedAt: null,
    watchlist: false,
  }));

  /** The entity for a row: by its TMDB ID, else through its Trakt ID, else by title. */
  const resolve = <T extends ShowAcc | MovieAcc>(
    acc: Accumulator<T>,
    known: Map<number, Known>,
    traktRaw: unknown,
    tmdbRaw: unknown,
    titleRaw?: unknown
  ): T | null => {
    const traktId = toId(traktRaw);
    const fromTrakt = traktId !== null ? known.get(traktId) : undefined;
    const tmdbId = toId(tmdbRaw) ?? fromTrakt?.tmdbId ?? null;
    const title = titleOf(titleRaw) || fromTrakt?.title || '';
    if (tmdbId === null && !title) return null;
    return acc.get({ tmdbId, title });
  };

  // ---- Shows -------------------------------------------------------------------
  for (const [key, status] of SHOW_SECTIONS) {
    for (const row of arrayOf(showsData[key])) {
      if (!isObject(row)) {
        tally.skip('malformed_row');
        continue;
      }
      const show = resolve(shows, knownShows, row.id, row.tmId, row.t);
      if (!show) {
        tally.skip('missing_identifiers');
        continue;
      }
      show.status ??= status;
      const addedAt = dateOf(row.a);
      show.addedAt ??= addedAt;
      show.fallbackDate ??= dateOf(row.u) ?? addedAt;
    }
  }

  for (const row of arrayOf(showsData.pEp)) {
    if (!isObject(row)) {
      tally.skip('malformed_row');
      continue;
    }
    const season = toSeasonNumber(row.sN);
    const episode = toEpisodeNumber(row.eN);
    if (season === null || episode === null) {
      tally.skip('malformed_row');
      continue;
    }
    const show = resolve(shows, knownShows, row.sId, row.stmId);
    if (!show) {
      tally.skip('missing_identifiers');
      continue;
    }
    // Losing watch progress is worse than an approximate date.
    const watchedAt = dateOf(row.a) ?? show.fallbackDate ?? fileDate;
    if (watchedAt === null) {
      tally.skip('invalid_date');
      continue;
    }
    const playKey = `${season}_${episode}`;
    const existing = show.plays.get(playKey);
    if (existing) {
      tally.ignore('duplicate_plays');
      existing.watchedAt = Math.max(existing.watchedAt, watchedAt);
      continue;
    }
    show.plays.set(playKey, { episode, season, watchedAt });
  }

  for (const row of arrayOf(showsData.rS)) {
    applyRating(row, (r) => resolve(shows, knownShows, r.id, r.tmId), tally, dateOf, fileDate, now);
  }
  for (const row of arrayOf(showsData.rSe)) {
    if (!isObject(row)) {
      tally.skip('malformed_row');
      continue;
    }
    // `sN` is -1 when Showly didn't know the season.
    const season = toSeasonNumber(row.sN);
    const value = toRatingValue(row.r);
    if (season === null || value === null) {
      tally.skip('malformed_row');
      continue;
    }
    const show = resolve(shows, knownShows, row.sId, row.stmId);
    if (!show) {
      tally.skip('missing_identifiers');
      continue;
    }
    if (!show.seasonRatings.has(season)) {
      show.seasonRatings.set(season, {
        ratedAt: dateOf(row.rA) ?? show.addedAt ?? fileDate ?? now,
        season,
        value,
      });
    }
  }
  for (const row of arrayOf(showsData.rEp)) {
    if (!isObject(row)) {
      tally.skip('malformed_row');
      continue;
    }
    const season = toSeasonNumber(row.sN);
    const episode = toEpisodeNumber(row.eN);
    const value = toRatingValue(row.r);
    if (season === null || episode === null || value === null) {
      tally.skip('malformed_row');
      continue;
    }
    const show = resolve(shows, knownShows, row.sId, row.stmId);
    if (!show) {
      tally.skip('missing_identifiers');
      continue;
    }
    const key = `${season}_${episode}`;
    if (!show.episodeRatings.has(key)) {
      show.episodeRatings.set(key, {
        episode,
        ratedAt: dateOf(row.rA) ?? show.addedAt ?? fileDate ?? now,
        season,
        value,
      });
    }
  }

  // ---- Movies ------------------------------------------------------------------
  for (const row of arrayOf(moviesData.cH)) {
    if (!isObject(row)) {
      tally.skip('malformed_row');
      continue;
    }
    const movie = resolve(movies, knownMovies, row.id, row.tmId, row.t);
    if (!movie) {
      tally.skip('missing_identifiers');
      continue;
    }
    // `a` is when the watched record last changed: the watch date the user chose.
    const watchedAt = dateOf(row.a) ?? fileDate;
    if (watchedAt === null) {
      tally.skip('invalid_date');
      continue;
    }
    movie.watchedAt = Math.max(movie.watchedAt ?? 0, watchedAt);
    movie.addedAt ??= watchedAt;
  }
  for (const row of arrayOf(moviesData.cW)) {
    if (!isObject(row)) {
      tally.skip('malformed_row');
      continue;
    }
    const movie = resolve(movies, knownMovies, row.id, row.tmId, row.t);
    if (!movie) {
      tally.skip('missing_identifiers');
      continue;
    }
    movie.watchlist = true;
    movie.addedAt = dateOf(row.a) ?? movie.addedAt;
  }
  // Hidden means "don't show me this"; the contract has no movie status for it.
  tally.ignore('hidden_movies', arrayOf(moviesData.cHid).length);

  for (const row of arrayOf(moviesData.rM)) {
    applyRating(
      row,
      (r) => resolve(movies, knownMovies, r.id, r.tmId),
      tally,
      dateOf,
      fileDate,
      now
    );
  }

  tally.ignore('pinned_items', arrayOf(showsData.pP).length + arrayOf(moviesData.pP).length);

  // ---- Custom lists ------------------------------------------------------------
  let emptyLists = 0;
  const usedLists = new Set<string>();
  for (const list of lists) {
    const name = titleOf(list.n) || DEFAULT_LIST_NAME;
    // `d` is left out of the file when the list has no description.
    const description =
      typeof list.d === 'string'
        ? list.d.trim().slice(0, FILE_IMPORT_MAX_LIST_DESCRIPTION_LENGTH).trim()
        : '';
    const listDate = dateOf(list.c) ?? fileDate ?? now;
    const items = arrayOf(list.it);
    if (items.length === 0) {
      emptyLists += 1;
      continue;
    }
    for (const item of items) {
      if (!isObject(item)) {
        tally.skip('malformed_row');
        continue;
      }
      if (item.t !== 'show' && item.t !== 'movie') {
        tally.ignore('non_media_list_items');
        continue;
      }
      const entity =
        item.t === 'show'
          ? resolve(shows, knownShows, item.tId, item.tmId)
          : resolve(movies, knownMovies, item.tId, item.tmId);
      if (!entity) {
        tally.skip('missing_identifiers');
        continue;
      }
      const addedAt = dateOf(item.l) ?? dateOf(item.c) ?? listDate;
      const listKey = name.toLowerCase();
      const existing = entity.lists.get(listKey);
      // Two Showly lists with the same name become one ShowSeek list (matched by name).
      const listDescription = existing?.description ?? (description || undefined);
      entity.lists.set(listKey, {
        addedAt: existing ? Math.min(existing.addedAt, addedAt) : addedAt,
        name: existing?.name ?? name,
        ...(listDescription ? { description: listDescription } : {}),
      });
      usedLists.add(listKey);
    }
  }

  // ---- Entities ----------------------------------------------------------------
  const showEntities: FileImportShowEntity[] = [];
  for (const show of shows.values()) {
    const plays = [...show.plays.values()].sort(
      (a, b) => a.season - b.season || a.episode - b.episode
    );
    const showLists = capLists(show.lists);
    // One chunk holds at most FILE_IMPORT_MAX_DETAIL_RATINGS_PER_CHUNK season + episode
    // ratings, and a show's ratings travel together; anything past that is counted.
    const seasonRatings = [...show.seasonRatings.values()]
      .sort((a, b) => a.season - b.season)
      .slice(0, FILE_IMPORT_MAX_DETAIL_RATINGS_PER_CHUNK);
    const episodeRatings = [...show.episodeRatings.values()]
      .sort((a, b) => a.season - b.season || a.episode - b.episode)
      .slice(0, FILE_IMPORT_MAX_DETAIL_RATINGS_PER_CHUNK - seasonRatings.length);
    tally.ignore('episode_ratings', show.episodeRatings.size - episodeRatings.length);
    const hasDetailRatings = seasonRatings.length + episodeRatings.length > 0;
    if (
      !show.status &&
      plays.length === 0 &&
      !show.rating &&
      !hasDetailRatings &&
      showLists.length === 0
    )
      continue;
    showEntities.push({
      addedAt: show.addedAt ?? earliest(showLists) ?? fileDate ?? now,
      favorite: false,
      imdbId: null,
      lists: showLists,
      plays,
      rating: show.rating,
      status: show.status,
      title: show.title,
      tvdbId: null,
      ...(show.tmdbId !== null ? { tmdbId: show.tmdbId } : {}),
      ...(seasonRatings.length > 0 ? { seasonRatings } : {}),
      ...(episodeRatings.length > 0 ? { episodeRatings } : {}),
    });
  }

  const movieEntities: FileImportMovieEntity[] = [];
  for (const movie of movies.values()) {
    const movieLists = capLists(movie.lists);
    // A watched movie isn't also kept on the watchlist (Showly moves it off on watch).
    const watchlist = movie.watchlist && movie.watchedAt === null;
    if (movie.watchedAt === null && !watchlist && !movie.rating && movieLists.length === 0)
      continue;
    movieEntities.push({
      addedAt: movie.addedAt ?? earliest(movieLists) ?? fileDate ?? now,
      favorite: false,
      imdbId: null,
      lists: movieLists,
      rating: movie.rating,
      title: movie.title,
      tvdbId: null,
      watches: movie.watchedAt !== null ? [movie.watchedAt] : [],
      watchlist,
      year: null,
      ...(movie.tmdbId !== null ? { tmdbId: movie.tmdbId } : {}),
    });
  }

  if (showEntities.length === 0 && movieEntities.length === 0) {
    throw new ShowlyImportError('no_history');
  }
  return {
    customLists: usedLists.size,
    emptyLists,
    movies: movieEntities,
    shows: showEntities,
    stats: tally.stats,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * One entity per title. Rows are joined by TMDB ID when they have one, otherwise by
 * title, so the same title under two Trakt IDs (Trakt merges) becomes one entity.
 */
class Accumulator<T extends { tmdbId: number | null; title: string }> {
  private readonly byKey = new Map<string, T>();
  constructor(private readonly create: (known: Known) => T) {}

  get(known: Known): T {
    const key =
      known.tmdbId !== null ? `tmdb:${known.tmdbId}` : `title:${known.title.toLowerCase()}`;
    let entity = this.byKey.get(key);
    if (!entity) {
      entity = this.create(known);
      this.byKey.set(key, entity);
    }
    entity.title ||= known.title;
    return entity;
  }

  values(): IterableIterator<T> {
    return this.byKey.values();
  }
}

function applyRating(
  row: unknown,
  find: (row: Json) => ShowAcc | MovieAcc | null,
  tally: Tally,
  dateOf: (raw: unknown) => number | null,
  fileDate: number | null,
  now: number
): void {
  if (!isObject(row)) {
    tally.skip('malformed_row');
    return;
  }
  const value = toRatingValue(row.r);
  if (value === null) {
    tally.skip('malformed_row');
    return;
  }
  const entity = find(row);
  if (!entity) {
    tally.skip('missing_identifiers');
    return;
  }
  entity.rating ??= { ratedAt: dateOf(row.rA) ?? entity.addedAt ?? fileDate ?? now, value };
}

/** At most FILE_IMPORT_MAX_LISTS_PER_ENTITY, keeping the most recently added. */
function capLists(lists: Map<string, FileImportListMembership>): FileImportListMembership[] {
  return [...lists.values()]
    .sort((a, b) => b.addedAt - a.addedAt)
    .slice(0, FILE_IMPORT_MAX_LISTS_PER_ENTITY);
}

function earliest(lists: FileImportListMembership[]): number | null {
  return lists.length > 0 ? Math.min(...lists.map((list) => list.addedAt)) : null;
}

/** A Trakt or TMDB ID the server accepts: a positive safe integer. */
function toId(raw: unknown): number | null {
  const value = toPositiveInt(raw);
  return value !== null && Number.isSafeInteger(value) ? value : null;
}

/** Season numbers the server accepts (0 = specials). Showly writes -1 when unknown. */
function toSeasonNumber(raw: unknown): number | null {
  const value = toNonNegativeInt(raw);
  return value !== null && value <= FILE_IMPORT_MAX_EPISODE_NUMBER ? value : null;
}

function toEpisodeNumber(raw: unknown): number | null {
  const value = toPositiveInt(raw);
  return value !== null && value <= FILE_IMPORT_MAX_EPISODE_NUMBER ? value : null;
}

/** Showly ratings are whole numbers from 1 to 10 (Trakt's scale, same as ShowSeek's). */
function toRatingValue(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 10 ? raw : null;
}

function titleOf(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().slice(0, MAX_TITLE_LENGTH) : '';
}

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectOf(value: unknown): Json {
  return isObject(value) ? value : {};
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}
