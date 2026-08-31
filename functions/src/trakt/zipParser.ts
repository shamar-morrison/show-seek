// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');
import {
  aggregateCustomLists,
  aggregateEpisodeHistory,
  aggregateFavorites,
  aggregateMovieHistory,
  aggregateRatings,
  aggregateWatchlist,
  type AggregatedTraktData,
  type RawCustomList,
  type RawEpisodeHistoryEvent,
  type RawFavoriteItem,
  type RawMovieHistoryEvent,
  type RawRatingEvent,
  type RawWatchlistItem,
} from './zipAggregator';

export type ZipEntryCategory =
  | 'history_movies'
  | 'history_episodes'
  | 'ratings_movies'
  | 'ratings_shows'
  | 'ratings_seasons'
  | 'ratings_episodes'
  | 'watchlist'
  | 'favorites'
  | 'lists'
  | 'ignored';

/**
 * Classifies a zip entry name into its corresponding Trakt dataset category.
 */
export const classifyZipEntry = (entryPath: string): ZipEntryCategory => {
  const normalized = entryPath
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

  // Ignore macOS metadata, hidden files, non-JSON files
  if (
    normalized.startsWith('__macosx') ||
    normalized.includes('/.ds_store') ||
    normalized.endsWith('.ds_store') ||
    !normalized.endsWith('.json')
  ) {
    return 'ignored';
  }

  const baseName = normalized.split('/').pop()?.replace(/\.json$/, '') ?? '';

  // Ratings
  if (/^ratings[-_]movies(-\d+)?$/.test(baseName) || normalized.includes('ratings/movies')) {
    return 'ratings_movies';
  }
  if (/^ratings[-_]shows(-\d+)?$/.test(baseName) || normalized.includes('ratings/shows')) {
    return 'ratings_shows';
  }
  if (/^ratings[-_]seasons(-\d+)?$/.test(baseName) || normalized.includes('ratings/seasons')) {
    return 'ratings_seasons';
  }
  if (/^ratings[-_]episodes(-\d+)?$/.test(baseName) || normalized.includes('ratings/episodes')) {
    return 'ratings_episodes';
  }

  // History / Plays
  if (
    /^history[-_]movies(-\d+)?$/.test(baseName) ||
    /^watched[-_]movies(-\d+)?$/.test(baseName) ||
    normalized.includes('history/movies')
  ) {
    return 'history_movies';
  }
  if (
    /^history[-_]episodes(-\d+)?$/.test(baseName) ||
    /^watched[-_]episodes(-\d+)?$/.test(baseName) ||
    /^history[-_]shows(-\d+)?$/.test(baseName) ||
    /^watched[-_]shows(-\d+)?$/.test(baseName) ||
    normalized.includes('history/episodes') ||
    normalized.includes('history/shows')
  ) {
    return 'history_episodes';
  }

  // Watchlist
  if (/^watchlist([-_].+)?$/.test(baseName) || normalized.includes('watchlist/')) {
    return 'watchlist';
  }

  // Favorites
  if (/^favorites([-_].+)?$/.test(baseName) || normalized.includes('favorites/')) {
    return 'favorites';
  }

  // Custom Lists
  if (
    /^lists(-\d+)?$/.test(baseName) ||
    normalized.startsWith('personal-lists/') ||
    normalized.startsWith('lists/') ||
    /^list[-_]/.test(baseName)
  ) {
    return 'lists';
  }

  return 'ignored';
};

/**
 * Streams through a Trakt export zip buffer file-by-file and parses all contained datasets.
 */
export const parseTraktZipBuffer = (zipBuffer: Buffer | string): AggregatedTraktData => {
  const ZipConstructor = (AdmZip as unknown as { default?: typeof AdmZip }).default || AdmZip;
  const zip = new ZipConstructor(zipBuffer);
  const entries = zip.getEntries();

  const rawMovieHistory: RawMovieHistoryEvent[] = [];
  const rawEpisodeHistory: RawEpisodeHistoryEvent[] = [];
  const rawRatings: RawRatingEvent[] = [];
  const rawWatchlist: RawWatchlistItem[] = [];
  const rawFavorites: RawFavoriteItem[] = [];
  const rawCustomLists: RawCustomList[] = [];

  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }

    const category = classifyZipEntry(entry.entryName);
    if (category === 'ignored') {
      continue;
    }

    let parsedData: unknown;
    try {
      const content = entry.getData().toString('utf8');
      parsedData = JSON.parse(content);
    } catch (parseError) {
      console.warn(`[zipParser] Failed to parse JSON in zip entry: ${entry.entryName}`, parseError);
      continue;
    }

    switch (category) {
      case 'history_movies':
        if (Array.isArray(parsedData)) {
          rawMovieHistory.push(...(parsedData as RawMovieHistoryEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawMovieHistory.push(parsedData as RawMovieHistoryEvent);
        }
        break;

      case 'history_episodes':
        if (Array.isArray(parsedData)) {
          rawEpisodeHistory.push(...(parsedData as RawEpisodeHistoryEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawEpisodeHistory.push(parsedData as RawEpisodeHistoryEvent);
        }
        break;

      case 'ratings_movies':
      case 'ratings_shows':
      case 'ratings_seasons':
      case 'ratings_episodes':
        if (Array.isArray(parsedData)) {
          rawRatings.push(...(parsedData as RawRatingEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawRatings.push(parsedData as RawRatingEvent);
        }
        break;

      case 'watchlist':
        if (Array.isArray(parsedData)) {
          rawWatchlist.push(...(parsedData as RawWatchlistItem[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawWatchlist.push(parsedData as RawWatchlistItem);
        }
        break;

      case 'favorites':
        if (Array.isArray(parsedData)) {
          rawFavorites.push(...(parsedData as RawFavoriteItem[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawFavorites.push(parsedData as RawFavoriteItem);
        }
        break;

      case 'lists':
        if (Array.isArray(parsedData)) {
          rawCustomLists.push(...(parsedData as RawCustomList[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawCustomLists.push(parsedData as RawCustomList);
        }
        break;
    }
  }

  const { movieWatches, watchedMovies } = aggregateMovieHistory(rawMovieHistory);
  const watchedShows = aggregateEpisodeHistory(rawEpisodeHistory);
  const ratings = aggregateRatings(rawRatings);
  const watchlist = aggregateWatchlist(rawWatchlist);
  const favorites = aggregateFavorites(rawFavorites);
  const customLists = aggregateCustomLists(rawCustomLists);

  const totalEpisodesWatched = watchedShows.reduce((sum, s) => sum + (s.plays || 0), 0);

  return {
    customLists,
    favorites,
    ratings,
    stats: {
      customLists: customLists.length,
      episodes: totalEpisodesWatched,
      favorites: favorites.length,
      movieWatches: movieWatches.length,
      movies: watchedMovies.length,
      ratings: ratings.length,
      shows: watchedShows.length,
      watchlistItems: watchlist.length,
    },
    watchedMovieEvents: movieWatches,
    watchedMovies,
    watchedShows,
    watchlist,
  };
};
