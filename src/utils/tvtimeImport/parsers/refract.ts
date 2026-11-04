import type { TvTimeShowStatus } from '@/functions/src/shared/tvtimeImport';
import { REFRACT_FILE_PATTERN, type TvTimeFileEntry } from '../files';
import { addToList, hasConflictingIds, type TvTimeLibrary } from '../library';
import {
  parseCsv,
  parseJsonArray,
  parseTvTimeDate,
  toBool,
  toImdbId,
  toNonNegativeInt,
  toPositiveInt,
  toText,
  toYear,
} from '../values';

/** TV Time's own status vocabulary, shared by Refract and Liberator exports. */
export const TVTIME_STATUS_MAP: Record<string, TvTimeShowStatus> = {
  continuing: 'watching',
  not_started_yet: 'watchlist',
  stopped: 'dropped',
  up_to_date: 'up_to_date',
};

type Kind = 'series' | 'series-episodes' | 'movies' | 'lists';

interface JsonId {
  tvdb?: number | null;
  imdb?: string | null;
}

/**
 * "TV Time Out by Refract" / "export my data": tvtime-<kind>[-YYYY-MM-DD].{csv,json}.
 * Users often upload both serializations; CSV carries more fields (uuid, created_at),
 * so it wins and JSON fills in only what's missing.
 */
export function parseRefractExport(entries: TvTimeFileEntry[], library: TvTimeLibrary): void {
  const pick = (kind: Kind, ext: 'csv' | 'json') =>
    entries.filter((entry) => {
      const match = entry.name.match(REFRACT_FILE_PATTERN);
      return match?.[1] === kind && match[2] === ext;
    });
  const { now } = library;

  // --- Shows ---------------------------------------------------------------
  const seriesCsv = pick('series', 'csv');
  const episodesCsv = pick('series-episodes', 'csv');
  const seriesJson = pick('series', 'json');

  for (const row of seriesCsv.flatMap((entry) => parseCsv(entry.text))) {
    const tvdbId = toPositiveInt(row.tvdb_id);
    if (tvdbId === null) {
      library.skip('missing_identifiers');
      continue;
    }
    const show = library.show(tvdbId, {
      addedAt: parseTvTimeDate(row.created_at, now),
      imdbId: toImdbId(row.imdb_id),
      title: toText(row.title),
    });
    show.status = TVTIME_STATUS_MAP[toText(row.status)] ?? show.status;
  }

  // Episodes the CSV already gave; JSON adds only the rest, so overlap isn't a "duplicate".
  const csvEpisodeKeys = new Set<string>();
  for (const row of episodesCsv.flatMap((entry) => parseCsv(entry.text))) {
    const tvdbId = toPositiveInt(row.series_tvdb_id);
    if (tvdbId === null) {
      library.skip('missing_identifiers');
      continue;
    }
    const show = library.show(tvdbId, {
      imdbId: toImdbId(row.series_imdb_id),
      title: toText(row.title),
    });
    if (!toBool(row.is_watched)) continue;
    // Only rows the CSV could use; a rejected one (e.g. a bad date) leaves JSON to fill in.
    if (addPlay(library, show, row.season, row.episode, row.tvdb_id, row.watched_at)) {
      csvEpisodeKeys.add(episodeKey(tvdbId, row.season, row.episode));
    }
  }

  for (const raw of seriesJson.flatMap((entry) => parseJsonArray(entry.text) ?? [])) {
    const item = raw as { id?: JsonId; title?: string; status?: string; seasons?: unknown[] };
    const tvdbId = toPositiveInt(item.id?.tvdb);
    if (tvdbId === null) continue;
    const known = library.findShow(tvdbId);
    const show = library.show(tvdbId, {
      imdbId: toImdbId(item.id?.imdb),
      title: toText(item.title),
    });
    if (!known || show.status === null)
      show.status = TVTIME_STATUS_MAP[toText(item.status)] ?? show.status;
    for (const seasonRaw of item.seasons ?? []) {
      const season = seasonRaw as { number?: number; episodes?: unknown[] };
      for (const episodeRaw of season.episodes ?? []) {
        const episode = episodeRaw as {
          id?: JsonId;
          number?: number;
          is_watched?: boolean;
          watched_at?: string | null;
        };
        if (episode.is_watched !== true) continue;
        if (csvEpisodeKeys.has(episodeKey(tvdbId, season.number, episode.number))) continue;
        addPlay(library, show, season.number, episode.number, episode.id?.tvdb, episode.watched_at);
      }
    }
  }

  // --- Movies --------------------------------------------------------------
  const moviesCsv = pick('movies', 'csv').flatMap((entry) => parseCsv(entry.text));
  const moviesJson = pick('movies', 'json').flatMap((entry) => parseJsonArray(entry.text) ?? []);
  const movieRows: {
    createdAt: string | undefined;
    imdb: unknown;
    title: unknown;
    tvdb: unknown;
    uuid: string | null;
    watched: boolean;
    watchedAt: unknown;
    year: unknown;
    fromJson?: boolean;
  }[] = [
    ...moviesCsv.map((row) => ({
      createdAt: row.created_at,
      imdb: row.imdb_id,
      title: row.title,
      tvdb: row.tvdb_id,
      uuid: toText(row.uuid) || null,
      watched: toBool(row.is_watched),
      watchedAt: row.watched_at,
      year: row.year,
    })),
    ...moviesJson.map((raw) => {
      const item = raw as {
        id?: JsonId;
        title?: string;
        year?: number;
        is_watched?: boolean;
        watched_at?: string | null;
      };
      return {
        createdAt: undefined,
        fromJson: true,
        imdb: item.id?.imdb,
        title: item.title,
        tvdb: item.id?.tvdb,
        uuid: null,
        watched: item.is_watched === true,
        watchedAt: item.watched_at,
        year: item.year,
      };
    }),
  ];

  for (const row of movieRows) {
    const lookup = {
      imdbId: toImdbId(row.imdb),
      title: toText(row.title),
      tvdbId: toPositiveInt(row.tvdb),
      uuid: row.uuid,
      year: toYear(row.year),
    };
    // CSV wins; JSON only adds movies the CSV doesn't have (a same-titled film with other ids is another movie).
    if (row.fromJson && moviesCsv.length > 0) {
      const found = library.findMovie(lookup);
      if (found && !hasConflictingIds(found, lookup)) {
        library.movie(lookup); // fills (and indexes) only the ids the CSV row lacked
        continue;
      }
    }
    if (row.watched) {
      const watchedAt = parseTvTimeDate(row.watchedAt, now);
      if (watchedAt === null) {
        library.skip('invalid_date');
        continue;
      }
      library.movie({ ...lookup, addedAt: watchedAt }).watches.add(watchedAt);
    } else {
      library.movie({ ...lookup, addedAt: parseTvTimeDate(row.createdAt, now) }).watchlist = true;
    }
  }

  // --- Custom lists --------------------------------------------------------
  const listsCsv = pick('lists', 'csv').flatMap((entry) => parseCsv(entry.text));
  const listItems =
    listsCsv.length > 0
      ? listsCsv.map((row) => ({
          list: toText(row.list_name),
          name: toText(row.name),
          tvdb: toPositiveInt(row.tvdb_id),
          type: toText(row.item_type),
          uuid: toText(row.uuid) || null,
        }))
      : pick('lists', 'json')
          .flatMap((entry) => parseJsonArray(entry.text) ?? [])
          .flatMap((raw) => {
            const list = raw as {
              name?: string;
              items?: {
                type?: string;
                tvdb_id?: number | null;
                uuid?: string | null;
                name?: string;
              }[];
            };
            return (list.items ?? []).map((item) => ({
              list: toText(list.name),
              name: toText(item.name),
              tvdb: toPositiveInt(item.tvdb_id),
              type: toText(item.type),
              uuid: item.uuid ?? null,
            }));
          });

  for (const item of listItems) {
    if (!item.list) continue;
    if (item.type === 'series' && item.tvdb !== null) {
      const show = library.show(item.tvdb, { title: item.name });
      addToList(show, item.list, show.addedAt ?? now);
    } else if (item.type === 'movie') {
      const movie = library.findReferencedMovie({
        title: item.name,
        tvdbId: item.tvdb,
        uuid: item.uuid,
      });
      if (movie === 'ambiguous') library.skip('ambiguous_title');
      else if (movie) addToList(movie, item.list, movie.addedAt ?? now);
      else library.skip('missing_identifiers');
    }
  }
}

function episodeKey(tvdbId: number, season: unknown, episode: unknown): string {
  return `${tvdbId}:${toNonNegativeInt(season)}:${toNonNegativeInt(episode)}`;
}

function addPlay(
  library: TvTimeLibrary,
  show: ReturnType<TvTimeLibrary['show']>,
  seasonRaw: unknown,
  episodeRaw: unknown,
  tvdbEpisodeRaw: unknown,
  watchedAtRaw: unknown
): boolean {
  const season = toNonNegativeInt(seasonRaw);
  const episode = toNonNegativeInt(episodeRaw);
  if (season === null || episode === null) {
    library.skip('malformed_row');
    return false;
  }
  const watchedAt = parseTvTimeDate(watchedAtRaw, library.now);
  if (watchedAt === null) {
    library.skip('invalid_date');
    return false;
  }
  const tvdbEpisodeId = toPositiveInt(tvdbEpisodeRaw);
  library.addPlay(show, {
    episode,
    season,
    ...(tvdbEpisodeId !== null ? { tvdbEpisodeId } : {}),
    watchedAt,
  });
  return true;
}
