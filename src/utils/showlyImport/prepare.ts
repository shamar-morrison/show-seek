import {
  FILE_IMPORT_MAX_ENTITIES_PER_CHUNK,
  FILE_IMPORT_MAX_PLAYS_PER_CHUNK,
  type FileImportChunkRequest,
  type FileImportMovieEntity,
  type FileImportShowEntity,
  type FileImportStats,
} from '@/functions/src/shared/fileImport';
import { readShowlyExportFile, type PickedShowlyFile } from './files';
import { parseShowlyBackup } from './parse';

/** A chunk as built on-device; the service adds the run's `importId` when sending. */
export type ShowlyChunk = Omit<FileImportChunkRequest, 'importId'>;

export interface ShowlyImportSummary {
  /** Showly's "My Shows". */
  following: number;
  showWatchlist: number;
  /** Showly's hidden shows. */
  dropped: number;
  episodes: number;
  watchedMovies: number;
  movieWatchlist: number;
  ratings: number;
  customLists: number;
  emptyLists: number;
}

export interface PreparedShowlyImport {
  format: 'json';
  chunks: ShowlyChunk[];
  /** Client-side skipped/ignored counts; merged with server stats for the summary. */
  stats: FileImportStats;
  summary: ShowlyImportSummary;
}

export function prepareShowlyImport(
  files: PickedShowlyFile[],
  now: number = Date.now()
): PreparedShowlyImport {
  const parsed = parseShowlyBackup(readShowlyExportFile(files), now);
  return {
    chunks: buildShowlyChunks(parsed.shows, parsed.movies),
    format: 'json',
    stats: parsed.stats,
    summary: {
      customLists: parsed.customLists,
      dropped: parsed.shows.filter((show) => show.status === 'dropped').length,
      emptyLists: parsed.emptyLists,
      episodes: parsed.shows.reduce((total, show) => total + show.plays.length, 0),
      following: parsed.shows.filter((show) => show.status === 'following').length,
      movieWatchlist: parsed.movies.filter((movie) => movie.watchlist).length,
      ratings: [...parsed.shows, ...parsed.movies].filter((entity) => entity.rating).length,
      showWatchlist: parsed.shows.filter((show) => show.status === 'watchlist').length,
      watchedMovies: parsed.movies.filter((movie) => movie.watches.length > 0).length,
    },
  };
}

/**
 * Packs entities into chunks of ≤ 15 entities and ≤ 1,500 plays. A show over the play
 * limit is split by season into `part`s, and **a show's parts stay in index order**:
 * the server decides a followed show's list on its last part, once every earlier part's
 * episodes are written. Heavier shows still go first.
 */
export function buildShowlyChunks(
  shows: FileImportShowEntity[],
  movies: FileImportMovieEntity[]
): ShowlyChunk[] {
  const parts = [...shows]
    .sort((left, right) => right.plays.length - left.plays.length)
    .flatMap(splitShow);
  const chunks: ShowlyChunk[] = [];
  let current: ShowlyChunk = { movies: [], shows: [] };
  let plays = 0;

  const flush = () => {
    if (current.shows.length + current.movies.length > 0) chunks.push(current);
    current = { movies: [], shows: [] };
    plays = 0;
  };
  const isFull = (extraPlays: number) =>
    current.shows.length + current.movies.length >= FILE_IMPORT_MAX_ENTITIES_PER_CHUNK ||
    plays + extraPlays > FILE_IMPORT_MAX_PLAYS_PER_CHUNK;

  for (const part of parts) {
    if (isFull(part.plays.length)) flush();
    current.shows.push(part);
    plays += part.plays.length;
  }
  for (const movie of movies) {
    if (isFull(0)) flush();
    current.movies.push(movie);
  }
  flush();
  return chunks;
}

function splitShow(show: FileImportShowEntity): FileImportShowEntity[] {
  if (show.plays.length <= FILE_IMPORT_MAX_PLAYS_PER_CHUNK) {
    return [show];
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

  // Rating and lists are written from part 0 only, so later parts don't carry them.
  return groups.map((plays, index) => ({
    ...show,
    ...(index > 0 ? { lists: [], rating: null } : {}),
    part: { index, total: groups.length },
    plays,
  }));
}
