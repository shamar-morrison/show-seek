export const IMDB_IMPORT_CHUNK_SIZE = 40;
export const IMDB_RESERVED_FILE_STEMS = {
  checkins: 'checkins',
  watchlist: 'watchlist',
} as const;

export type ImdbImportFileKind = 'ratings' | 'watchlist' | 'list' | 'checkins';

export type ImdbImportSkipReason =
  | 'unsupported_file'
  | 'malformed_row'
  | 'invalid_rating'
  | 'invalid_date'
  | 'unsupported_non_title_row'
  | 'unsupported_list_episode'
  | 'unresolved_imdb_id'
  | 'unsupported_tmdb_result';

export type ImdbImportIgnoredMetadataKey = 'item_notes';

export type ImdbImportAction =
  | {
      kind: 'rating';
      ratedAt: number;
      rating: number;
      sourceFileName: string;
    }
  | {
      kind: 'list';
      addedAt: number;
      isWatchlist: boolean;
      listName: string;
      sourceFileName: string;
    }
  | {
      kind: 'checkin';
      sourceFileName: string;
      watchedAt: number;
    };

export interface ImdbImportEntity {
  actions: ImdbImportAction[];
  imdbId: string;
  rawTitleType: string | null;
  title: string;
}

export interface ImdbImportCounts {
  customListsCreated: number;
  listItems: number;
  ratings: number;
  watchedEpisodes: number;
  watchedMovies: number;
  watchedShows: number;
}

export interface ImdbImportStats {
  ignored: Partial<Record<ImdbImportIgnoredMetadataKey, number>>;
  imported: ImdbImportCounts;
  processedActions: number;
  processedEntities: number;
  skipped: Partial<Record<ImdbImportSkipReason, number>>;
}

export interface ImdbImportChunkRequest {
  entities: ImdbImportEntity[];
}

export type ImdbImportChunkResult = ImdbImportStats;

export const createEmptyImdbImportCounts = (): ImdbImportCounts => ({
  customListsCreated: 0,
  listItems: 0,
  ratings: 0,
  watchedEpisodes: 0,
  watchedMovies: 0,
  watchedShows: 0,
});

export const createEmptyImdbImportStats = (): ImdbImportStats => ({
  ignored: {},
  imported: createEmptyImdbImportCounts(),
  processedActions: 0,
  processedEntities: 0,
  skipped: {},
});

export const incrementImportStat = <T extends string>(
  stats: Partial<Record<T, number>>,
  key: T,
  amount = 1
): Partial<Record<T, number>> => ({
  ...stats,
  [key]: (stats[key] ?? 0) + amount,
});

export const mergeImdbImportStats = (
  base: ImdbImportStats,
  incoming: ImdbImportStats
): ImdbImportStats => ({
  ignored: mergeStatMaps(base.ignored, incoming.ignored),
  imported: {
    customListsCreated: base.imported.customListsCreated + incoming.imported.customListsCreated,
    listItems: base.imported.listItems + incoming.imported.listItems,
    ratings: base.imported.ratings + incoming.imported.ratings,
    watchedEpisodes: base.imported.watchedEpisodes + incoming.imported.watchedEpisodes,
    watchedMovies: base.imported.watchedMovies + incoming.imported.watchedMovies,
    watchedShows: base.imported.watchedShows + incoming.imported.watchedShows,
  },
  processedActions: base.processedActions + incoming.processedActions,
  processedEntities: base.processedEntities + incoming.processedEntities,
  skipped: mergeStatMaps(base.skipped, incoming.skipped),
});

function mergeStatMaps<T extends string>(
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
