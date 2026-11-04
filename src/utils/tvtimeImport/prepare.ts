import {
  TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK,
  TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK,
  createEmptyTvTimeImportStats,
  type TvTimeImportChunkRequest,
  type TvTimeImportStats,
  type TvTimeMovieEntity,
  type TvTimeShowEntity,
} from '@/functions/src/shared/tvtimeImport';
import {
  REFRACT_FILE_PATTERN,
  TvTimeImportError,
  readTvTimeExportFiles,
  type PickedTvTimeFile,
  type TvTimeFileEntry,
} from './files';
import { TvTimeLibrary, toMovieEntities, toShowEntities } from './library';
import { parseExtractorExport } from './parsers/extractor';
import { parseGdprExport } from './parsers/gdpr';
import { parseLiberatorExport } from './parsers/liberator';
import { parseRefractExport } from './parsers/refract';

export type TvTimeExportFormat = 'gdpr' | 'refract' | 'liberator' | 'extractor';

/** A chunk as built on-device; the service adds the run's `importId` when sending. */
export type TvTimeChunk = Omit<TvTimeImportChunkRequest, 'importId'>;

export interface TvTimeImportSummary {
  shows: number;
  episodes: number;
  movies: number;
  movieWatches: number;
  watchlist: number;
  favorites: number;
  ratings: number;
  lists: number;
}

export interface PreparedTvTimeImport {
  format: TvTimeExportFormat;
  chunks: TvTimeChunk[];
  /** Client-side skipped/ignored counts; merged with server stats for the summary. */
  stats: TvTimeImportStats;
  summary: TvTimeImportSummary;
}

const PARSERS: Record<
  TvTimeExportFormat,
  (entries: TvTimeFileEntry[], library: TvTimeLibrary) => void
> = {
  extractor: parseExtractorExport,
  gdpr: parseGdprExport,
  liberator: parseLiberatorExport,
  refract: parseRefractExport,
};

export function detectTvTimeFormat(entries: TvTimeFileEntry[]): TvTimeExportFormat {
  const formats = new Set<TvTimeExportFormat>();
  for (const { name } of entries) {
    if (
      name.startsWith('tracking-prod-records') ||
      name.endsWith('_tv_show.csv') ||
      name.includes('-votes.csv') ||
      name === 'lists-prod-lists.csv' ||
      name === 'tv_show_rate.csv' ||
      name === 'user_tv_show_data.csv' ||
      name === 'user_show_special_status.csv'
    ) {
      formats.add('gdpr');
    } else if (REFRACT_FILE_PATTERN.test(name)) {
      formats.add('refract');
    } else if (name === 'tv-time-export.csv') {
      formats.add('extractor');
    } else {
      formats.add('liberator');
    }
  }
  if (formats.size > 1) throw new TvTimeImportError('mixed_formats');
  const [format] = formats;
  if (!format) throw new TvTimeImportError('unknown_format');
  return format;
}

/** Parse and normalize without chunking — the unit the parser tests assert on. */
export function parseTvTimeEntries(
  entries: TvTimeFileEntry[],
  now: number = Date.now()
): {
  format: TvTimeExportFormat;
  shows: TvTimeShowEntity[];
  movies: TvTimeMovieEntity[];
  stats: TvTimeImportStats;
} {
  const format = detectTvTimeFormat(entries);
  const library = new TvTimeLibrary(now);
  PARSERS[format](entries, library);

  const shows = toShowEntities(library);
  const movies = toMovieEntities(library);
  if (shows.length === 0 && movies.length === 0) {
    throw new TvTimeImportError(format === 'gdpr' ? 'no_history' : 'unknown_format');
  }

  const stats = createEmptyTvTimeImportStats();
  stats.skipped = library.skipped;
  stats.ignored = library.ignored;
  return { format, movies, shows, stats };
}

export function prepareTvTimeImport(
  files: PickedTvTimeFile[],
  now: number = Date.now()
): PreparedTvTimeImport {
  const { format, movies, shows, stats } = parseTvTimeEntries(readTvTimeExportFiles(files), now);
  return {
    chunks: buildTvTimeChunks(shows, movies),
    format,
    stats,
    summary: summarize(shows, movies),
  };
}

/**
 * Packs entities into chunks of ≤ 15 entities and ≤ 1,500 plays. Shows over the play
 * limit are split by season into `part`s; the largest shows go first so slow chunks
 * run while the user is still watching the progress screen.
 */
export function buildTvTimeChunks(
  shows: TvTimeShowEntity[],
  movies: TvTimeMovieEntity[]
): TvTimeChunk[] {
  const parts = shows.flatMap(splitShow).sort((a, b) => b.plays.length - a.plays.length);
  const chunks: TvTimeChunk[] = [];
  let current: TvTimeChunk = { movies: [], shows: [] };
  let currentPlays = 0;

  const flush = () => {
    if (current.shows.length + current.movies.length > 0) chunks.push(current);
    current = { movies: [], shows: [] };
    currentPlays = 0;
  };
  const isFull = (extraPlays: number) =>
    current.shows.length + current.movies.length >= TVTIME_IMPORT_MAX_ENTITIES_PER_CHUNK ||
    currentPlays + extraPlays > TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK;

  for (const show of parts) {
    if (isFull(show.plays.length)) flush();
    current.shows.push(show);
    currentPlays += show.plays.length;
  }
  for (const movie of movies) {
    if (isFull(0)) flush();
    current.movies.push(movie);
  }
  flush();
  return chunks;
}

function splitShow(show: TvTimeShowEntity): TvTimeShowEntity[] {
  if (show.plays.length <= TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK) return [show];

  // Plays are sorted by season/episode; cut at season boundaries where possible.
  const groups: (typeof show.plays)[] = [];
  let group: typeof show.plays = [];
  for (const play of show.plays) {
    const crossesSeason = group.length > 0 && group[group.length - 1].season !== play.season;
    if (
      group.length >= TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK ||
      (crossesSeason &&
        group.length + countSeason(show.plays, play.season) > TVTIME_IMPORT_MAX_PLAYS_PER_CHUNK)
    ) {
      groups.push(group);
      group = [];
    }
    group.push(play);
  }
  if (group.length) groups.push(group);

  return groups.map((plays, index) => ({ ...show, part: { index, total: groups.length }, plays }));
}

function countSeason(plays: TvTimeShowEntity['plays'], season: number): number {
  return plays.filter((play) => play.season === season).length;
}

function summarize(shows: TvTimeShowEntity[], movies: TvTimeMovieEntity[]): TvTimeImportSummary {
  const listNames = new Set(
    [...shows, ...movies].flatMap((entity) => entity.lists.map((list) => list.name))
  );
  return {
    episodes: shows.reduce((total, show) => total + show.plays.length, 0),
    favorites: [...shows, ...movies].filter((entity) => entity.favorite).length,
    lists: listNames.size,
    movieWatches: movies.reduce((total, movie) => total + movie.watches.length, 0),
    movies: movies.length,
    ratings: [...shows, ...movies].filter((entity) => entity.rating).length,
    shows: shows.length,
    watchlist:
      shows.filter((show) => show.status === 'watchlist').length +
      movies.filter((movie) => movie.watchlist).length,
  };
}
