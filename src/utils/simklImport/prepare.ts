import {
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK,
  type FileImportChunkRequest,
  type FileImportMovieEntity,
  type FileImportShowEntity,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { SimklImportError, readSimklExportFile, type PickedSimklFile } from './files';
import { parseSimklBackupJson } from './parsers/json';

/** A chunk as built on-device; the service adds the run's `importId` when sending. */
export type SimklChunk = Omit<FileImportChunkRequest, 'importId'>;

export interface SimklImportSummary {
  shows: number;
  anime: number;
  /** Episodes listed with the shows (before "watched up to" expansion). */
  episodes: number;
  /** Shows whose episodes are known only as a "watched up to" point. */
  summaryOnlyShows: number;
  movies: number;
  movieWatches: number;
  watchlist: number;
  ratings: number;
}

export interface PreparedSimklImport {
  format: 'json';
  chunks: SimklChunk[];
  /** Client-side skipped/ignored counts; merged with server stats for the summary. */
  stats: FileImportStats;
  summary: SimklImportSummary;
}

/**
 * Episodes the server may write per chunk, counting "watched up to" expansion. The
 * server's own expansion cap (MAX_EXPANDED_EPISODES_PER_CALL) is a safety net far above
 * this; this keeps a chunk's work, and its TMDB season fetches, to roughly what a TV
 * Time chunk does.
 */
const MAX_EPISODE_WEIGHT_PER_CHUNK = FILE_IMPORT_MAX_PLAYS_PER_CHUNK;

export function prepareSimklImport(
  files: PickedSimklFile[],
  now: number = Date.now()
): PreparedSimklImport {
  const file = readSimklExportFile(files);
  if (file.kind === 'csv') {
    // The CSV backup (Simkl Pro) is phase 2; see docs/simkl-import-plan.md.
    throw new SimklImportError('csv_not_supported');
  }
  const parsed = parseSimklBackupJson(file.text, now);
  return {
    chunks: buildSimklChunks(parsed.shows, parsed.movies, parsed.showWeights),
    format: 'json',
    stats: parsed.stats,
    summary: summarize(parsed.shows, parsed.movies),
  };
}

/**
 * Packs entities into chunks of ≤ 15 entities, ≤ 1,500 listed plays and ≤ ~1,500
 * expected episode writes. A show over the play limit is split by season into `part`s
 * (only part 0 carries status, rating and "watched up to"); the heaviest shows go first
 * so slow chunks run while the user is watching the progress screen.
 */
export function buildSimklChunks(
  shows: FileImportShowEntity[],
  movies: FileImportMovieEntity[],
  showWeights: number[] = shows.map((show) => show.plays.length)
): SimklChunk[] {
  const parts = shows
    .flatMap((show, index) => splitShow(show, showWeights[index] ?? show.plays.length))
    .sort((left, right) => right.weight - left.weight);
  const chunks: SimklChunk[] = [];
  let current: SimklChunk = { movies: [], shows: [] };
  let plays = 0;
  let weight = 0;

  const flush = () => {
    if (current.shows.length + current.movies.length > 0) chunks.push(current);
    current = { movies: [], shows: [] };
    plays = 0;
    weight = 0;
  };
  const isFull = (extraPlays: number, extraWeight: number) =>
    current.shows.length + current.movies.length >= FILE_IMPORT_MAX_ENTITIES_PER_CHUNK ||
    plays + extraPlays > FILE_IMPORT_MAX_PLAYS_PER_CHUNK ||
    // A single heavy show still gets a chunk of its own.
    (weight > 0 && weight + extraWeight > MAX_EPISODE_WEIGHT_PER_CHUNK);

  for (const part of parts) {
    if (isFull(part.show.plays.length, part.weight)) flush();
    current.shows.push(part.show);
    plays += part.show.plays.length;
    weight += part.weight;
  }
  for (const movie of movies) {
    if (isFull(0, 1)) flush();
    current.movies.push(movie);
    weight += 1;
  }
  flush();
  return chunks;
}

function splitShow(
  show: FileImportShowEntity,
  weight: number
): { show: FileImportShowEntity; weight: number }[] {
  if (show.plays.length <= FILE_IMPORT_MAX_PLAYS_PER_CHUNK) {
    return [{ show, weight }];
  }

  // Plays are sorted by season/episode; cut at season boundaries where possible.
  const seasonSizes = new Map<number, number>();
  for (const play of show.plays) {
    seasonSizes.set(play.season, (seasonSizes.get(play.season) ?? 0) + 1);
  }
  const groups: (typeof show.plays)[] = [];
  let group: typeof show.plays = [];
  for (const play of show.plays) {
    const crossesSeason = group.length > 0 && group[group.length - 1].season !== play.season;
    if (
      group.length >= FILE_IMPORT_MAX_PLAYS_PER_CHUNK ||
      (crossesSeason &&
        group.length + (seasonSizes.get(play.season) ?? 0) > FILE_IMPORT_MAX_PLAYS_PER_CHUNK)
    ) {
      groups.push(group);
      group = [];
    }
    group.push(play);
  }
  if (group.length) groups.push(group);

  const expansion = Math.max(0, weight - show.plays.length);
  return groups.map((plays, index) => {
    const part: FileImportShowEntity = { ...show, part: { index, total: groups.length }, plays };
    if (index > 0) {
      // The server expands "watched up to" on part 0 only; don't send it twice.
      delete part.watchedThrough;
      delete part.watchedThroughAt;
    }
    return { show: part, weight: plays.length + (index === 0 ? expansion : 0) };
  });
}

function summarize(
  shows: FileImportShowEntity[],
  movies: FileImportMovieEntity[]
): SimklImportSummary {
  return {
    anime: shows.filter((show) => show.anime).length,
    episodes: shows.reduce((total, show) => total + show.plays.length, 0),
    movieWatches: movies.reduce((total, movie) => total + movie.watches.length, 0),
    movies: movies.length,
    ratings: [...shows, ...movies].filter((entity) => entity.rating).length,
    shows: shows.length,
    summaryOnlyShows: shows.filter((show) => show.watchedThrough).length,
    watchlist:
      shows.filter((show) => show.status === 'watchlist').length +
      movies.filter((movie) => movie.watchlist).length,
  };
}
