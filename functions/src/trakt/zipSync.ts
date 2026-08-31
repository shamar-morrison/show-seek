import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  buildAlreadyWatchedItemsMap,
  buildCustomListItemsMap,
} from './builders';
import { TRAKT_MANAGED_DEFAULT_LIST_NAMES } from './constants';
import {
  countManagedListItemsByMediaType,
  reconcileEpisodeTracking,
  reconcileManagedList,
  reconcileRatings,
  syncFavorites,
  syncWatchlist,
} from './sync';
import {
  normalizeChangedListIds,
  toFirestoreTimestamp,
} from './transforms';
import type {
  TraktIncrementalCustomListState,
  TraktList,
  TraktListItem,
} from './types';
import type { AggregatedTraktData } from './zipAggregator';

export interface TraktZipImportResult {
  customListsSynced: number;
  episodesSynced: number;
  favoritesSynced: number;
  listsToEnrich: string[];
  moviesSynced: number;
  movieWatchesSynced: number;
  ratingsSynced: number;
  showsSynced: number;
  watchlistSynced: number;
}

export interface ReconcileCustomListsFromZipOptions {
  preserveLocalItems?: boolean;
}

/**
 * Reconciles custom lists parsed from local Trakt zip export data without making any external API calls.
 */
export const reconcileCustomListsFromZip = async (
  userId: string,
  customLists: { items: TraktListItem[]; list: TraktList }[],
  options: ReconcileCustomListsFromZipOptions = {}
): Promise<{
  changedCount: number;
  customLists: Record<string, TraktIncrementalCustomListState>;
  listsToEnrich: string[];
}> => {
  const listsCollection = admin.firestore().collection('users').doc(userId).collection('lists');
  const localListsSnapshot = await listsCollection.get();
  const localTraktLists = new Map(
    localListsSnapshot.docs.filter((doc) => doc.id.startsWith('trakt_')).map((doc) => [doc.id, doc])
  );
  const nextCustomLists: Record<string, TraktIncrementalCustomListState> = {};
  const listsToEnrich: string[] = [];
  let changedCount = 0;

  if (Array.isArray(customLists)) {
    for (const entry of customLists) {
      if (!entry || !entry.list || typeof entry.list.ids?.trakt !== 'number') {
        continue;
      }

      const { list, items } = entry;
      const traktId = String(list.ids.trakt);
      const listId = `trakt_${traktId}`;
      const safeSlug = list.ids.slug || listId;

      nextCustomLists[traktId] = {
        slug: safeSlug,
        updatedAt: list.updated_at || new Date().toISOString(),
      };

      const result = await reconcileManagedList(
        userId,
        listId,
        buildCustomListItemsMap(items || []),
        {
          createdAt: toFirestoreTimestamp(list.created_at),
          description: list.description || '',
          isCustom: true,
          name: list.name,
          privacy: list.privacy === 'public' ? 'public' : 'private',
          traktId: list.ids.trakt,
          updatedAt: toFirestoreTimestamp(list.updated_at),
        },
        localTraktLists.get(listId),
        {
          countBaseDataChangesAsRemoteChange: true,
          preserveLocalItems: options.preserveLocalItems ?? true,
          recencyField: 'addedAt',
        }
      );

      if (result.didRemoteChange) {
        changedCount += 1;
      }
      if (result.shouldEnrich) {
        listsToEnrich.push(listId);
      }
    }
  }

  return {
    changedCount,
    customLists: nextCustomLists,
    listsToEnrich: normalizeChangedListIds(listsToEnrich),
  };
};

/**
 * Main orchestrator for Trakt zip import. Consumes aggregated local zip data
 * and reconciles watchlists, favorites, ratings, history, custom lists, and
 * granular movie watch logs into Firestore with recency-based conflict resolution.
 */
export const syncTraktZipImport = async (
  userId: string,
  data: Partial<AggregatedTraktData>
): Promise<TraktZipImportResult> => {
  const listsToEnrich: string[] = [];
  const safeData: AggregatedTraktData = {
    customLists: Array.isArray(data?.customLists) ? data.customLists : [],
    favorites: Array.isArray(data?.favorites) ? data.favorites : [],
    ratings: Array.isArray(data?.ratings) ? data.ratings : [],
    stats: data?.stats ?? {
      customLists: 0,
      episodes: 0,
      favorites: 0,
      movieWatches: 0,
      movies: 0,
      ratings: 0,
      shows: 0,
      watchlistItems: 0,
    },
    watchedMovieEvents: Array.isArray(data?.watchedMovieEvents) ? data.watchedMovieEvents : [],
    watchedMovies: Array.isArray(data?.watchedMovies) ? data.watchedMovies : [],
    watchedShows: Array.isArray(data?.watchedShows) ? data.watchedShows : [],
    watchlist: Array.isArray(data?.watchlist) ? data.watchlist : [],
  };

  // 1. Reconcile already-watched managed list (movies and shows combined)
  const alreadyWatchedItems = buildAlreadyWatchedItemsMap(
    safeData.watchedMovies,
    safeData.watchedShows
  );
  const alreadyWatchedResult = await reconcileManagedList(
    userId,
    'already-watched',
    alreadyWatchedItems,
    {
      id: 'already-watched',
      name: TRAKT_MANAGED_DEFAULT_LIST_NAMES['already-watched'],
    },
    undefined,
    {
      preserveLocalItems: true,
      recencyField: 'addedAt',
    }
  );
  if (alreadyWatchedResult.shouldEnrich) {
    listsToEnrich.push('already-watched');
  }

  // 2. Reconcile granular episode tracking
  const episodeTrackingResult = await reconcileEpisodeTracking(
    userId,
    safeData.watchedShows
  );

  // 3. Reconcile ratings
  const ratingsResult = await reconcileRatings(
    userId,
    safeData.ratings
  );

  // 4. Reconcile watchlist
  const watchlistResult = await syncWatchlist(
    userId,
    safeData.watchlist
  );
  if (watchlistResult.shouldEnrich) {
    listsToEnrich.push('watchlist');
  }

  // 5. Reconcile favorites
  const favoritesResult = await syncFavorites(
    userId,
    safeData.favorites
  );
  if (favoritesResult.shouldEnrich) {
    listsToEnrich.push('favorites');
  }

  // 6. Reconcile custom lists from local zip data
  const customListsResult = await reconcileCustomListsFromZip(
    userId,
    safeData.customLists
  );
  listsToEnrich.push(...customListsResult.listsToEnrich);

  // 7. Write granular movie watch documents (users/{uid}/watched_movies/{movieId}/watches/{docId})
  const db = admin.firestore();
  const BATCH_SIZE = 400;
  let movieWatchesWritten = 0;

  for (let i = 0; i < safeData.watchedMovieEvents.length; i += BATCH_SIZE) {
    const chunk = safeData.watchedMovieEvents.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    let hasWrites = false;

    for (const watch of chunk) {
      if (
        !watch ||
        typeof watch.movieId !== 'number' ||
        typeof watch.watchedAt !== 'number' ||
        !watch.docId
      ) {
        continue;
      }

      const docRef = db
        .collection('users')
        .doc(userId)
        .collection('watched_movies')
        .doc(String(watch.movieId))
        .collection('watches')
        .doc(watch.docId);

      batch.set(
        docRef,
        {
          movieId: watch.movieId,
          watchedAt: Timestamp.fromMillis(watch.watchedAt),
        },
        { merge: true }
      );
      hasWrites = true;
      movieWatchesWritten += 1;
    }

    if (hasWrites) {
      await batch.commit();
    }
  }

  const movieCount = countManagedListItemsByMediaType(alreadyWatchedItems, 'movie');
  const showCount = countManagedListItemsByMediaType(alreadyWatchedItems, 'tv');

  return {
    customListsSynced: Object.keys(customListsResult.customLists).length,
    episodesSynced: episodeTrackingResult.itemCount,
    favoritesSynced: favoritesResult.itemCount,
    listsToEnrich: normalizeChangedListIds(listsToEnrich),
    moviesSynced: movieCount,
    movieWatchesSynced: movieWatchesWritten,
    ratingsSynced: ratingsResult.itemCount,
    showsSynced: showCount,
    watchlistSynced: watchlistResult.itemCount,
  };
};
