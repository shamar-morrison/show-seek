// eslint-disable-next-line @typescript-eslint/no-require-imports
import AdmZip = require('adm-zip');
import {
  MAX_ZIP_TOTAL_UNCOMPRESSED_SIZE_BYTES,
  MAX_ZIP_UNCOMPRESSED_ENTRY_SIZE_BYTES,
} from './constants';
import {
  aggregateCustomLists,
  aggregateEpisodeHistory,
  aggregateFavorites,
  aggregateMovieHistory,
  aggregateRatings,
  aggregateShowSummaries,
  aggregateWatchlist,
  type AggregatedMovieWatch,
  type AggregatedTraktData,
  type RawCustomList,
  type RawCustomListMetadata,
  type RawEpisodeHistoryEvent,
  type RawFavoriteItem,
  type RawMovieHistoryEvent,
  type RawRatingEvent,
  type RawWatchlistItem,
} from './zipAggregator';
import type {
  TraktWatchedMovie,
  TraktWatchedShow,
} from './types';

export type ZipEntryCategory =
  | 'history_events'
  | 'history_movies'
  | 'history_episodes'
  | 'ratings_movies'
  | 'ratings_shows'
  | 'ratings_seasons'
  | 'ratings_episodes'
  | 'watchlist'
  | 'favorites'
  | 'lists_metadata'
  | 'list_items'
  | 'legacy_custom_list'
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

  // Watchlist (supports lists-watchlist, watchlist, watchlist-movies, etc.)
  if (/^(lists[-_])?watchlist([-_].+)?$/.test(baseName) || normalized.includes('watchlist/')) {
    return 'watchlist';
  }

  // Favorites (supports lists-favorites, favorites, favorites-movies, etc.)
  if (/^(lists[-_])?favorites([-_].+)?$/.test(baseName) || normalized.includes('favorites/')) {
    return 'favorites';
  }

  // Watched History Events (granular per-play events for movies and episodes in one file)
  if (
    /^watched[-_]history(-\d+)?$/.test(baseName) ||
    /^history(-\d+)?$/.test(baseName) ||
    normalized.includes('history/all')
  ) {
    return 'history_events';
  }

  // History / Watched Movies summaries
  if (
    /^history[-_]movies(-\d+)?$/.test(baseName) ||
    /^watched[-_]movies(-\d+)?$/.test(baseName) ||
    normalized.includes('history/movies')
  ) {
    return 'history_movies';
  }

  // History / Watched Shows summaries
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

  // Custom List Definitions Metadata (lists-lists.json or lists.json)
  if (/^lists[-_]lists(-\d+)?$/.test(baseName) || /^lists(-\d+)?$/.test(baseName)) {
    return 'lists_metadata';
  }

  // Custom List Items (lists-list-{id}-{slug}.json)
  if (/^lists[-_]list[-_]\d+/.test(baseName)) {
    return 'list_items';
  }

  // Legacy / Folder-based custom lists
  if (
    normalized.startsWith('personal-lists/') ||
    normalized.startsWith('lists/') ||
    /^list[-_]/.test(baseName)
  ) {
    return 'legacy_custom_list';
  }

  return 'ignored';
};

/**
 * Streams through a Trakt export zip buffer file-by-file and parses all contained datasets.
 */
export const parseTraktZipBuffer = (
  zipBuffer: Buffer | string,
  options?: {
    maxEntrySizeBytes?: number;
    maxTotalUncompressedSizeBytes?: number;
  }
): AggregatedTraktData => {
  const maxEntrySizeBytes = options?.maxEntrySizeBytes ?? MAX_ZIP_UNCOMPRESSED_ENTRY_SIZE_BYTES;
  const maxTotalSizeBytes = options?.maxTotalUncompressedSizeBytes ?? MAX_ZIP_TOTAL_UNCOMPRESSED_SIZE_BYTES;

  const ZipConstructor = (AdmZip as unknown as { default?: typeof AdmZip }).default || AdmZip;
  const zip = new ZipConstructor(zipBuffer);
  const entries = zip.getEntries();

  // 1. Validate declared uncompressed size in headers across relevant entries before extraction
  let declaredTotalUncompressedBytes = 0;
  for (const entry of entries) {
    if (entry.isDirectory) {
      continue;
    }
    const category = classifyZipEntry(entry.entryName);
    if (category === 'ignored') {
      continue;
    }
    const declaredSize = entry.header?.size ?? 0;
    if (declaredSize > maxEntrySizeBytes) {
      throw new Error(
        `Trakt zip entry "${entry.entryName}" decompressed size (${declaredSize} bytes) exceeds the maximum allowed limit (${maxEntrySizeBytes} bytes).`
      );
    }
    declaredTotalUncompressedBytes += declaredSize;
    if (declaredTotalUncompressedBytes > maxTotalSizeBytes) {
      throw new Error(
        `Trakt zip aggregate decompressed size (${declaredTotalUncompressedBytes} bytes) exceeds the maximum allowed limit (${maxTotalSizeBytes} bytes).`
      );
    }
  }

  const rawHistoryEvents: (RawMovieHistoryEvent | RawEpisodeHistoryEvent)[] = [];
  const rawSummaryMovies: RawMovieHistoryEvent[] = [];
  const rawSummaryShows: RawEpisodeHistoryEvent[] = [];
  const rawRatings: RawRatingEvent[] = [];
  const rawWatchlist: RawWatchlistItem[] = [];
  const rawFavorites: RawFavoriteItem[] = [];
  const rawListsMetadata: RawCustomListMetadata[] = [];
  const rawListItemsByTraktId = new Map<number, RawWatchlistItem[]>();
  const rawListItemsBySlug = new Map<string, RawWatchlistItem[]>();
  const rawLegacyCustomLists: RawCustomList[] = [];

  // Track raw counts present in zip to enforce safety net integrity checks
  const inputCounts = {
    favorites: 0,
    historyEvents: 0,
    listsMetadata: 0,
    ratings: 0,
    summaryMovies: 0,
    summaryShows: 0,
    watchlist: 0,
  };

  let actualTotalUncompressedBytes = 0;

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
      const dataBuffer = entry.getData();
      if (dataBuffer.length > maxEntrySizeBytes) {
        throw new Error(
          `Trakt zip entry "${entry.entryName}" decompressed size (${dataBuffer.length} bytes) exceeds the maximum allowed limit (${maxEntrySizeBytes} bytes).`
        );
      }
      actualTotalUncompressedBytes += dataBuffer.length;
      if (actualTotalUncompressedBytes > maxTotalSizeBytes) {
        throw new Error(
          `Trakt zip aggregate decompressed size (${actualTotalUncompressedBytes} bytes) exceeds the maximum allowed limit (${maxTotalSizeBytes} bytes).`
        );
      }
      const content = dataBuffer.toString('utf8');
      parsedData = JSON.parse(content);
    } catch (parseError) {
      if (
        parseError instanceof Error &&
        parseError.message.includes('decompressed size') &&
        parseError.message.includes('exceeds the maximum allowed limit')
      ) {
        throw parseError;
      }
      console.warn(`[zipParser] Failed to parse JSON in zip entry: ${entry.entryName}`, parseError);
      continue;
    }

    const baseName = entry.entryName.split('/').pop()?.replace(/\.json$/, '').toLowerCase() ?? '';

    switch (category) {
      case 'history_events':
        if (Array.isArray(parsedData)) {
          inputCounts.historyEvents += parsedData.length;
          rawHistoryEvents.push(...(parsedData as (RawMovieHistoryEvent | RawEpisodeHistoryEvent)[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.historyEvents += 1;
          rawHistoryEvents.push(parsedData as RawMovieHistoryEvent | RawEpisodeHistoryEvent);
        }
        break;

      case 'history_movies':
        if (Array.isArray(parsedData)) {
          inputCounts.summaryMovies += parsedData.length;
          rawSummaryMovies.push(...(parsedData as RawMovieHistoryEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.summaryMovies += 1;
          rawSummaryMovies.push(parsedData as RawMovieHistoryEvent);
        }
        break;

      case 'history_episodes':
        if (Array.isArray(parsedData)) {
          inputCounts.summaryShows += parsedData.length;
          rawSummaryShows.push(...(parsedData as RawEpisodeHistoryEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.summaryShows += 1;
          rawSummaryShows.push(parsedData as RawEpisodeHistoryEvent);
        }
        break;

      case 'ratings_movies':
      case 'ratings_shows':
      case 'ratings_seasons':
      case 'ratings_episodes':
        if (Array.isArray(parsedData)) {
          inputCounts.ratings += parsedData.length;
          rawRatings.push(...(parsedData as RawRatingEvent[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.ratings += 1;
          rawRatings.push(parsedData as RawRatingEvent);
        }
        break;

      case 'watchlist':
        if (Array.isArray(parsedData)) {
          inputCounts.watchlist += parsedData.length;
          rawWatchlist.push(...(parsedData as RawWatchlistItem[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.watchlist += 1;
          rawWatchlist.push(parsedData as RawWatchlistItem);
        }
        break;

      case 'favorites':
        if (Array.isArray(parsedData)) {
          inputCounts.favorites += parsedData.length;
          rawFavorites.push(...(parsedData as RawFavoriteItem[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.favorites += 1;
          rawFavorites.push(parsedData as RawFavoriteItem);
        }
        break;

      case 'lists_metadata':
        if (Array.isArray(parsedData)) {
          inputCounts.listsMetadata += parsedData.length;
          rawListsMetadata.push(...(parsedData as RawCustomListMetadata[]));
        } else if (parsedData && typeof parsedData === 'object') {
          inputCounts.listsMetadata += 1;
          rawListsMetadata.push(parsedData as RawCustomListMetadata);
        }
        break;

      case 'list_items': {
        const items = Array.isArray(parsedData)
          ? (parsedData as RawWatchlistItem[])
          : parsedData && typeof parsedData === 'object'
            ? [parsedData as RawWatchlistItem]
            : [];
        const match = baseName.match(/^lists[-_]list[-_](\d+)(?:[-_](.+))?$/);
        if (match) {
          const traktId = parseInt(match[1], 10);
          const slug = match[2]?.trim();
          if (Number.isFinite(traktId)) {
            const existing = rawListItemsByTraktId.get(traktId) || [];
            rawListItemsByTraktId.set(traktId, [...existing, ...items]);
          }
          if (slug) {
            rawListItemsBySlug.set(slug, items);
          }
        }
        break;
      }

      case 'legacy_custom_list':
        if (Array.isArray(parsedData)) {
          rawLegacyCustomLists.push(...(parsedData as RawCustomList[]));
        } else if (parsedData && typeof parsedData === 'object') {
          rawLegacyCustomLists.push(parsedData as RawCustomList);
        }
        break;
    }
  }

  // 1. Watched History Resolution:
  // Use granular watched-history events as primary authority; fall back to summary files if absent.
  let movieWatches: AggregatedMovieWatch[] = [];
  let watchedMovies: TraktWatchedMovie[] = [];
  let watchedShows: TraktWatchedShow[] = [];

  if (rawHistoryEvents.length > 0) {
    const rawMovieHistory: RawMovieHistoryEvent[] = [];
    const rawEpisodeHistory: RawEpisodeHistoryEvent[] = [];

    for (const event of rawHistoryEvents) {
      if (!event || typeof event !== 'object') {
        continue;
      }
      if (event.type === 'movie' || (event as RawMovieHistoryEvent).movie) {
        rawMovieHistory.push(event as RawMovieHistoryEvent);
      } else if (
        event.type === 'episode' ||
        (event as RawEpisodeHistoryEvent).episode ||
        (event as RawEpisodeHistoryEvent).show
      ) {
        rawEpisodeHistory.push(event as RawEpisodeHistoryEvent);
      }
    }

    const movieResult = aggregateMovieHistory(rawMovieHistory);
    movieWatches = movieResult.movieWatches;
    watchedMovies = movieResult.watchedMovies;
    watchedShows = aggregateEpisodeHistory(rawEpisodeHistory);
  } else {
    const movieResult = aggregateMovieHistory(rawSummaryMovies);
    movieWatches = movieResult.movieWatches;
    watchedMovies = movieResult.watchedMovies;
    // Check if summary shows have episode structures or are top-level summaries
    const hasNestedEpisodes = rawSummaryShows.some((s) => s.episode?.season !== undefined);
    watchedShows = hasNestedEpisodes
      ? aggregateEpisodeHistory(rawSummaryShows)
      : aggregateShowSummaries(rawSummaryShows);
  }

  // 2. Custom Lists Assembly:
  // Correlate lists-lists.json metadata with lists-list-*.json items
  const rawAssembledLists: RawCustomList[] = [];

  if (rawListsMetadata.length > 0) {
    for (const meta of rawListsMetadata) {
      if (!meta || typeof meta !== 'object' || !meta.name) {
        continue;
      }
      const traktId = meta.ids?.trakt;
      const slug = meta.ids?.slug;
      const pairedItems =
        (typeof traktId === 'number' ? rawListItemsByTraktId.get(traktId) : undefined) ||
        (slug ? rawListItemsBySlug.get(slug) : undefined) ||
        [];

      rawAssembledLists.push({
        created_at: meta.created_at,
        description: meta.description,
        ids: meta.ids,
        items: pairedItems,
        name: meta.name,
        privacy: meta.privacy,
        updated_at: meta.updated_at,
      });
    }
  }

  rawAssembledLists.push(...rawLegacyCustomLists);

  const ratings = aggregateRatings(rawRatings);
  const watchlist = aggregateWatchlist(rawWatchlist);
  const favorites = aggregateFavorites(rawFavorites);
  const customLists = aggregateCustomLists(rawAssembledLists);

  // 3. Safety Net / Integrity Checks:
  // If an input file is present and non-empty in the archive, it MUST produce parsed items,
  // otherwise throw a descriptive error to prevent silent failed imports.
  if (inputCounts.historyEvents > 0 && watchedMovies.length === 0 && watchedShows.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: watched-history contained ${inputCounts.historyEvents} events but produced 0 valid movies and TV shows.`
    );
  }
  if (inputCounts.summaryMovies > 0 && rawHistoryEvents.length === 0 && watchedMovies.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: watched-movies contained ${inputCounts.summaryMovies} items but produced 0 valid movies.`
    );
  }
  if (inputCounts.summaryShows > 0 && rawHistoryEvents.length === 0 && watchedShows.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: watched-shows contained ${inputCounts.summaryShows} items but produced 0 valid TV shows.`
    );
  }
  if (inputCounts.ratings > 0 && ratings.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: ratings contained ${inputCounts.ratings} items but produced 0 valid ratings.`
    );
  }
  if (inputCounts.watchlist > 0 && watchlist.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: watchlist contained ${inputCounts.watchlist} items but produced 0 valid watchlist entries.`
    );
  }
  if (inputCounts.favorites > 0 && favorites.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: favorites contained ${inputCounts.favorites} items but produced 0 valid favorite entries.`
    );
  }
  if (inputCounts.listsMetadata > 0 && customLists.length === 0) {
    throw new Error(
      `Trakt zip parsing integrity check failed: custom lists metadata contained ${inputCounts.listsMetadata} lists but produced 0 valid custom lists.`
    );
  }

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
