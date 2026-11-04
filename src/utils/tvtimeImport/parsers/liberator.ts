import type { TvTimeFileEntry } from '../files';
import { addToList, type TvTimeLibrary } from '../library';
import {
  parseCsv,
  parseJsonArray,
  parseJsonObject,
  parseTvTimeDate,
  toBool,
  toImdbId,
  toNonNegativeInt,
  toPositiveInt,
  toRating,
  toText,
} from '../values';
import { TVTIME_STATUS_MAP } from './refract';

interface JsonId {
  tvdb?: number | null;
  imdb?: string | null;
}
interface LiberatorEpisode {
  id?: JsonId;
  number?: number;
  rating?: number | null;
  is_watched?: boolean;
  watched_at?: string | null;
}
interface LiberatorShow {
  id?: JsonId;
  uuid?: string;
  title?: string;
  status?: string;
  created_at?: string;
  added_at?: string;
  seasons?: { number?: number; episodes?: LiberatorEpisode[] }[];
}
interface LiberatorMovie {
  id?: JsonId;
  uuid?: string;
  title?: string;
  created_at?: string;
  added_at?: string;
  rating?: number | null;
  is_watched?: boolean;
  watched_at?: string | null;
}

/**
 * TV Time Liberator (extension ZIP `tv-time-export.zip` or CLI folder).
 * Ratings are already on a 1–10 scale. shows.json/movies.json are preferred;
 * activity_history.csv is a fallback when only the CSV was kept.
 */
export function parseLiberatorExport(entries: TvTimeFileEntry[], library: TvTimeLibrary): void {
  const text = (name: string) => entries.find((entry) => entry.name === name)?.text;
  const shows = parseJsonArray(text('shows.json') ?? '') as LiberatorShow[] | null;
  const movies = parseJsonArray(text('movies.json') ?? '') as LiberatorMovie[] | null;

  if (shows) shows.forEach((show) => addShow(library, show));
  if (movies) movies.forEach((movie) => addMovie(library, movie));
  if (!shows || !movies) {
    const csv = text('activity_history.csv');
    if (csv) parseActivityCsv(csv, library, { movies: !movies, shows: !shows });
  }

  const favorites = parseJsonObject(text('favorites.json') ?? '');
  for (const show of (favorites?.shows as LiberatorShow[] | undefined) ?? []) {
    const tvdbId = toPositiveInt(show.id?.tvdb);
    if (tvdbId !== null) library.show(tvdbId, { title: toText(show.title) }).favorite = true;
  }
  for (const movie of (favorites?.movies as LiberatorMovie[] | undefined) ?? []) {
    const found = library.findMovie(movieLookup(movie));
    if (found) found.favorite = true;
    else library.skip('missing_identifiers');
  }

  const lists = parseJsonArray(text('lists.json') ?? '') ?? [];
  for (const raw of lists) {
    const list = raw as { name?: string; shows?: LiberatorShow[]; movies?: LiberatorMovie[] };
    const name = toText(list.name);
    if (!name) continue;
    for (const show of list.shows ?? []) {
      const tvdbId = toPositiveInt(show.id?.tvdb);
      if (tvdbId === null) continue;
      const draft = library.show(tvdbId, { title: toText(show.title) });
      addToList(
        draft,
        name,
        parseTvTimeDate(show.added_at, library.now) ?? draft.addedAt ?? library.now
      );
    }
    for (const movie of list.movies ?? []) {
      const found = library.findMovie(movieLookup(movie));
      if (!found) {
        library.skip('missing_identifiers');
        continue;
      }
      addToList(
        found,
        name,
        parseTvTimeDate(movie.added_at, library.now) ?? found.addedAt ?? library.now
      );
    }
  }
}

function addShow(library: TvTimeLibrary, item: LiberatorShow): void {
  const tvdbId = toPositiveInt(item.id?.tvdb);
  if (tvdbId === null) {
    library.skip('missing_identifiers');
    return;
  }
  const show = library.show(tvdbId, {
    addedAt: parseTvTimeDate(item.created_at, library.now),
    imdbId: toImdbId(item.id?.imdb),
    title: toText(item.title),
  });
  show.status = TVTIME_STATUS_MAP[toText(item.status)] ?? show.status;

  for (const season of item.seasons ?? []) {
    for (const episode of season.episodes ?? []) {
      if (episode.is_watched !== true) continue;
      if (toRating(episode.rating) !== null) library.ignore('episode_ratings');
      addPlay(library, show, season.number, episode.number, episode.id?.tvdb, episode.watched_at);
    }
  }
}

function addMovie(library: TvTimeLibrary, item: LiberatorMovie): void {
  const lookup = movieLookup(item);
  if (!lookup.tvdbId && !lookup.imdbId && !lookup.title) {
    library.skip('missing_identifiers');
    return;
  }
  const watchedAt = item.is_watched ? parseTvTimeDate(item.watched_at, library.now) : null;
  if (item.is_watched && watchedAt === null) {
    library.skip('invalid_date');
    return;
  }
  const movie = library.movie({
    ...lookup,
    addedAt: watchedAt ?? parseTvTimeDate(item.created_at, library.now),
  });
  if (watchedAt !== null) movie.watches.add(watchedAt);
  else movie.watchlist = true;

  const value = toRating(item.rating);
  if (value !== null) movie.rating = { ratedAt: watchedAt ?? movie.addedAt ?? library.now, value };
}

/** activity_history.csv fallback. Note: a show row's `is_watchlisted` means "has unwatched episodes". */
function parseActivityCsv(
  csv: string,
  library: TvTimeLibrary,
  want: { shows: boolean; movies: boolean }
): void {
  // Liberator writes movie, then episode, then show rows; shows must exist before
  // their episodes can be grouped by title.
  const rows = parseCsv(csv).sort((a, b) => Number(b.type === 'show') - Number(a.type === 'show'));
  for (const row of rows) {
    const type = toText(row.type);
    const tvdbId = toPositiveInt(row.tvdb_id);

    if (type === 'show' && want.shows && tvdbId !== null) {
      const show = library.show(tvdbId, {
        imdbId: toImdbId(row.imdb_id),
        title: toText(row.title),
      });
      show.status = TVTIME_STATUS_MAP[toText(row.status)] ?? show.status;
    } else if (type === 'episode' && want.shows) {
      // Episode rows carry the episode's TVDB id, not the show's; group by title.
      const show = findShowByTitle(library, toText(row.title));
      if (!show) {
        library.skip('missing_identifiers');
        continue;
      }
      if (toRating(Number(row.rating)) !== null) library.ignore('episode_ratings');
      addPlay(library, show, row.season, row.episode, row.tvdb_id, row.watched_at);
    } else if (type === 'movie' && want.movies) {
      addMovie(library, {
        id: { imdb: row.imdb_id, tvdb: tvdbId },
        is_watched: toBool(row.is_watched),
        rating: row.rating ? Number(row.rating) : null,
        title: row.title,
        watched_at: row.watched_at,
      });
    }
  }
}

function findShowByTitle(library: TvTimeLibrary, title: string) {
  if (!title) return undefined;
  for (const show of library.shows.values()) {
    if (show.title === title) return show;
  }
  return undefined;
}

function movieLookup(item: LiberatorMovie) {
  return {
    imdbId: toImdbId(item.id?.imdb),
    title: toText(item.title),
    tvdbId: toPositiveInt(item.id?.tvdb),
    uuid: toText(item.uuid) || null,
  };
}

function addPlay(
  library: TvTimeLibrary,
  show: ReturnType<TvTimeLibrary['show']>,
  seasonRaw: unknown,
  episodeRaw: unknown,
  tvdbEpisodeRaw: unknown,
  watchedAtRaw: unknown
): void {
  const season = toNonNegativeInt(seasonRaw);
  const episode = toNonNegativeInt(episodeRaw);
  if (season === null || episode === null) {
    library.skip('malformed_row');
    return;
  }
  const watchedAt = parseTvTimeDate(watchedAtRaw, library.now);
  if (watchedAt === null) {
    library.skip('invalid_date');
    return;
  }
  const tvdbEpisodeId = toPositiveInt(tvdbEpisodeRaw);
  library.addPlay(show, {
    episode,
    season,
    ...(tvdbEpisodeId !== null ? { tvdbEpisodeId } : {}),
    watchedAt,
  });
}
