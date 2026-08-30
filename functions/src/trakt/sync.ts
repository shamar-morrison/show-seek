import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getLegacyListItemKey } from '../shared/listItemKeys';
import {
  buildAlreadyWatchedItemsMap,
  buildCustomListItemsMap,
  buildEpisodeTrackingDoc,
  buildFavoriteItemsMap,
  buildRatingsMap,
  buildWatchlistItemsMap,
} from './builders';
import {
  getFavorites,
  getLastActivities,
  getListItems,
  getRatings,
  getUserLists,
  getUserProfile,
  getWatchedMovies,
  getWatchedShows,
  getWatchlist,
  refreshAccessToken,
} from './client';
import {
  TRAKT_INCREMENTAL_SCHEMA_VERSION,
  TRAKT_MANAGED_DEFAULT_LIST_NAMES,
  TRAKT_SYNC_QUEUE_FUNCTION,
  TRAKT_SYNC_RECONNECT_MESSAGE,
  TRAKT_TOKEN_REFRESH_THRESHOLD_MS,
} from './constants';
import { buildTaskDispatchOptions } from './enrichment';
import { emptyItemsSynced, getSyncSummaryMode } from './status';
import {
  didActivityFieldChange,
  hasActivityGroupChanged,
  hasManagedFieldChanges,
  isListMediaType,
  isPlainObject,
  mergeManagedValue,
  normalizeChangedListIds,
  normalizeStoredListItems,
  shouldApplyRemoteManagedValue,
  stripUndefinedDeep,
} from './transforms';
import type {
  ReconcileManagedListOptions,
  SyncStatusItems,
  SyncSummaryMode,
  TraktFavorite,
  TraktIncrementalCustomListState,
  TraktIncrementalState,
  TraktList,
  TraktRating,
  TraktTaskDispatchOptions,
  TraktUserDoc,
  TraktWatchedShow,
  TraktWatchlistItem,
} from './types';
import { TraktSyncError } from './types';

export const maybeRefreshAccessToken = async (userId: string, userData: TraktUserDoc): Promise<string> => {
  const currentAccessToken = typeof userData.traktAccessToken === 'string' ? userData.traktAccessToken : '';
  const refreshToken = typeof userData.traktRefreshToken === 'string' ? userData.traktRefreshToken : '';
  const expiresAt = userData.traktTokenExpiresAt instanceof Timestamp ? userData.traktTokenExpiresAt.toMillis() : 0;

  if (!currentAccessToken) {
    throw new TraktSyncError(TRAKT_SYNC_RECONNECT_MESSAGE, 'auth_invalid', false);
  }

  if (!refreshToken || !expiresAt || expiresAt - Date.now() >= TRAKT_TOKEN_REFRESH_THRESHOLD_MS) {
    return currentAccessToken;
  }

  const refreshed = await refreshAccessToken(refreshToken);
  const newExpiresAt = Timestamp.fromMillis((refreshed.created_at + refreshed.expires_in) * 1000);

  await admin.firestore().collection('users').doc(userId).set(
    {
      traktAccessToken: refreshed.access_token,
      traktRefreshToken: refreshed.refresh_token,
      traktTokenExpiresAt: newExpiresAt,
    },
    { merge: true }
  );

  return refreshed.access_token;
};

export const countManagedListItemsByMediaType = (
  items: Record<string, Record<string, unknown>>,
  mediaType: 'movie' | 'tv'
): number =>
  Object.values(items).filter((item) => item.media_type === mediaType).length;

export const countMediaTypeChanges = (mediaTypes: ('movie' | 'tv')[], mediaType: 'movie' | 'tv'): number =>
  mediaTypes.filter((value) => value === mediaType).length;

export const reconcileManagedList = async (
  userId: string,
  listId: string,
  remoteItems: Record<string, Record<string, unknown>>,
  baseData: Record<string, unknown>,
  existingSnapshot?: FirebaseFirestore.DocumentSnapshot,
  options: ReconcileManagedListOptions = {}
): Promise<{
  changedCount: number;
  changedMediaTypes: ('movie' | 'tv')[];
  didRemoteChange: boolean;
  didWrite: boolean;
  shouldEnrich: boolean;
}> => {
  const listRef =
    existingSnapshot?.ref ?? admin.firestore().collection('users').doc(userId).collection('lists').doc(listId);
  const snapshot = existingSnapshot ?? (await listRef.get());
  const existingData = (snapshot.data() ?? {}) as Record<string, unknown>;
  const existingItemsRaw = isPlainObject(existingData.items)
    ? (existingData.items as Record<string, unknown>)
    : undefined;
  const existingItems = normalizeStoredListItems(existingItemsRaw);
  const itemChanges: Record<string, unknown> = {};
  const changedMediaTypes: ('movie' | 'tv')[] = [];
  let changedCount = 0;
  let addedOrUpdatedCount = 0;
  let hasItemWrites = false;
  const preserveLocalItems = options.preserveLocalItems ?? false;

  Object.entries(remoteItems).forEach(([remoteKey, remoteItem]) => {
    const mediaType = remoteItem.media_type;
    const mediaId = remoteItem.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      return;
    }

    const existingItem = existingItems[remoteKey];
    const legacyKey = getLegacyListItemKey(mediaId);
    const hasLegacyKey = Boolean(existingItemsRaw && legacyKey !== remoteKey && legacyKey in existingItemsRaw);
    const shouldApplyRemote = shouldApplyRemoteManagedValue(existingItem, remoteItem, options.recencyField);
    const nextItem =
      !existingItem || shouldApplyRemote ? mergeManagedValue(existingItem, remoteItem) : existingItem;
    const shouldWriteNormalizedItem = !existingItem || hasLegacyKey || shouldApplyRemote;
    const isRemoteChange = !existingItem || shouldApplyRemote;

    if (shouldWriteNormalizedItem) {
      itemChanges[remoteKey] = nextItem;
      hasItemWrites = true;
      if (isRemoteChange) {
        changedMediaTypes.push(mediaType);
        changedCount += 1;
        addedOrUpdatedCount += 1;
      }
    }

    if (hasLegacyKey) {
      itemChanges[legacyKey] = FieldValue.delete();
      hasItemWrites = true;
    }
  });

  if (!preserveLocalItems) {
    Object.entries(existingItems).forEach(([existingKey, existingItem]) => {
      if (remoteItems[existingKey]) {
        return;
      }

      itemChanges[existingKey] = FieldValue.delete();
      hasItemWrites = true;

      const mediaType = existingItem.media_type;
      const mediaId = existingItem.id;
      if (isListMediaType(mediaType)) {
        changedMediaTypes.push(mediaType);
      }
      if (typeof mediaId === 'number' && existingItemsRaw) {
        const legacyKey = getLegacyListItemKey(mediaId);
        if (legacyKey !== existingKey && legacyKey in existingItemsRaw) {
          itemChanges[legacyKey] = FieldValue.delete();
          hasItemWrites = true;
        }
      }

      changedCount += 1;
    });
  }

  const existingMetadata = isPlainObject(existingData.metadata)
    ? (existingData.metadata as Record<string, unknown>)
    : {};
  const nextNeedsEnrichment = Boolean(existingMetadata.needsEnrichment) || addedOrUpdatedCount > 0;
  const baseDataChanged = hasManagedFieldChanges(existingData, baseData);
  const didRemoteChange =
    changedCount > 0 || (baseDataChanged && Boolean(options.countBaseDataChangesAsRemoteChange));
  const nextItemCount = preserveLocalItems
    ? new Set([...Object.keys(existingItems), ...Object.keys(remoteItems)]).size
    : Object.keys(remoteItems).length;
  const metadataChanged =
    existingMetadata.itemCount !== nextItemCount || Boolean(existingMetadata.needsEnrichment) !== nextNeedsEnrichment;
  const shouldWrite = !snapshot.exists || hasItemWrites || baseDataChanged || metadataChanged;

  if (!shouldWrite) {
    return {
      changedCount: 0,
      changedMediaTypes: [],
      didRemoteChange: false,
      didWrite: false,
      shouldEnrich: false,
    };
  }

  const payload = stripUndefinedDeep(
    {
      ...baseData,
      items:
        hasItemWrites
          ? itemChanges
          : !snapshot.exists
            ? {}
            : undefined,
      metadata: {
        ...existingMetadata,
        itemCount: nextItemCount,
        lastUpdated: Timestamp.now(),
        needsEnrichment: nextNeedsEnrichment,
      },
    },
    true
  ) as FirebaseFirestore.DocumentData;

  await listRef.set(payload, { merge: true });

  return {
    changedCount,
    changedMediaTypes,
    didRemoteChange,
    didWrite: true,
    shouldEnrich: addedOrUpdatedCount > 0,
  };
};

export const reconcileEpisodeTracking = async (
  userId: string,
  traktShows: TraktWatchedShow[]
): Promise<{ changedCount: number; itemCount: number }> => {
  const db = admin.firestore();
  const collectionRef = db.collection('users').doc(userId).collection('episode_tracking');
  const existingSnapshot = await collectionRef.get();
  const existingDocs = new Map(existingSnapshot.docs.map((doc) => [doc.id, doc]));
  const batch = db.batch();
  let writeCount = 0;
  let changedEpisodes = 0;
  let importedEpisodes = 0;

  for (const traktShow of traktShows) {
    const remoteDoc = buildEpisodeTrackingDoc(traktShow);
    if (!remoteDoc) {
      continue;
    }

    importedEpisodes += Object.keys(remoteDoc.episodes).length;

    const existingDoc = existingDocs.get(remoteDoc.showId);
    const existingData = (existingDoc?.data() ?? {}) as Record<string, unknown>;
    const existingEpisodes = isPlainObject(existingData.episodes)
      ? (existingData.episodes as Record<string, Record<string, unknown>>)
      : {};
    const episodeChanges: Record<string, unknown> = {};
    let docChanged = !existingDoc;

    Object.entries(remoteDoc.episodes).forEach(([episodeKey, remoteEpisode]) => {
      const existingEpisode = isPlainObject(existingEpisodes[episodeKey])
        ? (existingEpisodes[episodeKey] as Record<string, unknown>)
        : undefined;

      if (shouldApplyRemoteManagedValue(existingEpisode, remoteEpisode, 'watchedAt')) {
        episodeChanges[episodeKey] = mergeManagedValue(existingEpisode, remoteEpisode);
        changedEpisodes += 1;
        docChanged = true;
      }
    });

    const existingMetadata = isPlainObject(existingData.metadata)
      ? (existingData.metadata as Record<string, unknown>)
      : {};
    const metadataBase = {
      tvShowName: remoteDoc.metadata.tvShowName,
    };
    const metadataChanged = !existingDoc || hasManagedFieldChanges(existingMetadata, metadataBase);

    if (docChanged || metadataChanged) {
      batch.set(
        collectionRef.doc(remoteDoc.showId),
        stripUndefinedDeep(
          {
            episodes:
              Object.keys(episodeChanges).length > 0
                ? episodeChanges
                : !existingDoc
                  ? {}
                  : undefined,
            metadata: {
              ...existingMetadata,
              ...metadataBase,
              lastUpdated: Timestamp.now(),
            },
          },
          true
        ) as FirebaseFirestore.DocumentData,
        { merge: true }
      );
      writeCount += 1;
    }

    existingDocs.delete(remoteDoc.showId);
  }

  if (writeCount > 0) {
    await batch.commit();
  }

  return {
    changedCount: changedEpisodes,
    itemCount: importedEpisodes,
  };
};

export const reconcileRatings = async (
  userId: string,
  traktRatings: TraktRating[]
): Promise<{ changedCount: number; itemCount: number }> => {
  const db = admin.firestore();
  const ratingsCollection = db.collection('users').doc(userId).collection('ratings');
  const existingSnapshot = await ratingsCollection.get();
  const existingDocs = new Map(
    existingSnapshot.docs
      .filter((doc) => doc.id.startsWith('movie-') || doc.id.startsWith('tv-'))
      .map((doc) => [doc.id, doc])
  );
  const remoteRatings = buildRatingsMap(traktRatings);

  const batch = db.batch();
  let writeCount = 0;
  let changedCount = 0;

  Object.entries(remoteRatings).forEach(([docId, remoteRating]) => {
    const existingDoc = existingDocs.get(docId);
    const existingData = (existingDoc?.data() ?? {}) as Record<string, unknown>;

    if (shouldApplyRemoteManagedValue(existingDoc ? existingData : undefined, remoteRating, 'ratedAt')) {
      batch.set(
        ratingsCollection.doc(docId),
        mergeManagedValue(existingDoc ? existingData : undefined, remoteRating),
        { merge: false }
      );
      changedCount += 1;
      writeCount += 1;
    }

    existingDocs.delete(docId);
  });

  if (writeCount > 0) {
    await batch.commit();
  }

  return {
    changedCount,
    itemCount: Object.keys(remoteRatings).length,
  };
};

export const syncWatchlist = async (
  userId: string,
  traktWatchlist: TraktWatchlistItem[]
): Promise<{ changedCount: number; itemCount: number; shouldEnrich: boolean }> => {
  const remoteItems = buildWatchlistItemsMap(traktWatchlist);
  const result = await reconcileManagedList(
    userId,
    'watchlist',
    remoteItems,
    {
      id: 'watchlist',
      name: TRAKT_MANAGED_DEFAULT_LIST_NAMES.watchlist,
    },
    undefined,
    {
      preserveLocalItems: true,
      recencyField: 'addedAt',
    }
  );

  return {
    changedCount: result.changedCount,
    itemCount: Object.keys(remoteItems).length,
    shouldEnrich: result.shouldEnrich,
  };
};

export const syncFavorites = async (
  userId: string,
  traktFavorites: TraktFavorite[]
): Promise<{ changedCount: number; itemCount: number; shouldEnrich: boolean }> => {
  const remoteItems = buildFavoriteItemsMap(traktFavorites);
  const result = await reconcileManagedList(
    userId,
    'favorites',
    remoteItems,
    {
      id: 'favorites',
      name: TRAKT_MANAGED_DEFAULT_LIST_NAMES.favorites,
    },
    undefined,
    {
      preserveLocalItems: true,
      recencyField: 'addedAt',
    }
  );

  return {
    changedCount: result.changedCount,
    itemCount: Object.keys(remoteItems).length,
    shouldEnrich: result.shouldEnrich,
  };
};

export const syncCustomLists = async (
  userId: string,
  accessToken: string,
  username: string,
  traktLists: TraktList[]
): Promise<number> => {
  let changedCount = 0;

  for (const traktList of traktLists) {
    const listItems = await getListItems(accessToken, username, traktList.ids.slug);
    const result = await reconcileManagedList(
      userId,
      `trakt_${traktList.ids.trakt}`,
      buildCustomListItemsMap(listItems),
      {
        createdAt: Timestamp.fromDate(new Date(traktList.created_at)),
        description: traktList.description || '',
        isCustom: true,
        name: traktList.name,
        privacy: traktList.privacy === 'public' ? 'public' : 'private',
        traktId: traktList.ids.trakt,
        updatedAt: Timestamp.fromDate(new Date(traktList.updated_at)),
      },
      undefined,
      {
        countBaseDataChangesAsRemoteChange: true,
      }
    );

    if (result.didRemoteChange) {
      changedCount += 1;
    }
  }

  return changedCount;
};

export const reconcileCustomLists = async (
  userId: string,
  accessToken: string,
  username: string,
  traktLists: TraktList[],
  previousCustomLists: Record<string, TraktIncrementalCustomListState>,
  bootstrap: boolean
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
  const nextCustomLists = Object.fromEntries(
    traktLists.map((traktList) => [
      String(traktList.ids.trakt),
      {
        slug: traktList.ids.slug,
        updatedAt: traktList.updated_at,
      },
    ])
  ) as Record<string, TraktIncrementalCustomListState>;
  const listsToEnrich: string[] = [];
  let changedCount = 0;

  for (const traktList of traktLists) {
    const traktId = String(traktList.ids.trakt);
    const listId = `trakt_${traktId}`;
    const previousState = previousCustomLists[traktId];
    const shouldReconcileList =
      bootstrap ||
      !previousState ||
      previousState.slug !== traktList.ids.slug ||
      previousState.updatedAt !== traktList.updated_at ||
      !localTraktLists.has(listId);

    if (!shouldReconcileList) {
      continue;
    }

    const listItems = await getListItems(accessToken, username, traktList.ids.slug);
    const result = await reconcileManagedList(
      userId,
      listId,
      buildCustomListItemsMap(listItems),
      {
        createdAt: Timestamp.fromDate(new Date(traktList.created_at)),
        description: traktList.description || '',
        isCustom: true,
        name: traktList.name,
        privacy: traktList.privacy === 'public' ? 'public' : 'private',
        traktId: traktList.ids.trakt,
        updatedAt: Timestamp.fromDate(new Date(traktList.updated_at)),
      },
      localTraktLists.get(listId),
      {
        countBaseDataChangesAsRemoteChange: true,
        preserveLocalItems: false,
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

  const removedLocalLists = localListsSnapshot.docs.filter(
    (doc) => doc.id.startsWith('trakt_') && !nextCustomLists[doc.id.replace(/^trakt_/, '')]
  );
  if (removedLocalLists.length > 0) {
    const deleteBatch = admin.firestore().batch();
    removedLocalLists.forEach((doc) => {
      deleteBatch.delete(doc.ref);
      changedCount += 1;
    });
    await deleteBatch.commit();
  }

  return {
    changedCount,
    customLists: nextCustomLists,
    listsToEnrich: normalizeChangedListIds(listsToEnrich),
  };
};

export const syncTraktImport = async (
  userId: string,
  accessToken: string,
  currentIncrementalState?: TraktIncrementalState
): Promise<{
  itemsSynced: SyncStatusItems;
  listsToEnrich: string[];
  nextIncrementalState: TraktIncrementalState;
  summaryMode: SyncSummaryMode;
}> => {
  const itemsSynced = emptyItemsSynced();
  const summaryMode = getSyncSummaryMode(currentIncrementalState);
  const lastActivities = await getLastActivities(accessToken);
  const bootstrap = summaryMode === 'bootstrap';
  const previousActivities = currentIncrementalState?.lastActivities;
  const shouldSyncWatched =
    bootstrap ||
    didActivityFieldChange(previousActivities?.movies, lastActivities.movies, 'watched_at') ||
    didActivityFieldChange(previousActivities?.shows, lastActivities.shows, 'watched_at') ||
    didActivityFieldChange(previousActivities?.episodes, lastActivities.episodes, 'watched_at');
  const shouldSyncRatings =
    bootstrap ||
    didActivityFieldChange(previousActivities?.movies, lastActivities.movies, 'rated_at') ||
    didActivityFieldChange(previousActivities?.shows, lastActivities.shows, 'rated_at');
  const shouldSyncWatchlist =
    bootstrap || hasActivityGroupChanged(previousActivities?.watchlist, lastActivities.watchlist);
  const shouldSyncFavorites =
    bootstrap || hasActivityGroupChanged(previousActivities?.favorites, lastActivities.favorites);
  const shouldSyncCustomLists =
    bootstrap || hasActivityGroupChanged(previousActivities?.lists, lastActivities.lists);
  const listsToEnrich: string[] = [];
  let customListsState = currentIncrementalState?.customLists ?? {};

  if (shouldSyncWatched) {
    try {
      const watchedMovies = await getWatchedMovies(accessToken);
      const watchedShows = await getWatchedShows(accessToken);
      const alreadyWatchedItems = buildAlreadyWatchedItemsMap(watchedMovies, watchedShows);
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
      const episodeTrackingResult = await reconcileEpisodeTracking(userId, watchedShows);

      itemsSynced.movies =
        summaryMode === 'bootstrap'
          ? countManagedListItemsByMediaType(alreadyWatchedItems, 'movie')
          : countMediaTypeChanges(alreadyWatchedResult.changedMediaTypes, 'movie');
      itemsSynced.shows =
        summaryMode === 'bootstrap'
          ? countManagedListItemsByMediaType(alreadyWatchedItems, 'tv')
          : countMediaTypeChanges(alreadyWatchedResult.changedMediaTypes, 'tv');
      itemsSynced.episodes =
        summaryMode === 'bootstrap' ? episodeTrackingResult.itemCount : episodeTrackingResult.changedCount;

      if (alreadyWatchedResult.shouldEnrich) {
        listsToEnrich.push('already-watched');
      }
    } catch (error) {
      console.error('[TraktSync] Error during watched items sync step (/sync/watched/movies, /sync/watched/shows?extended=progress):', {
        error,
        userId,
      });
      throw error;
    }
  }

  if (shouldSyncRatings) {
    try {
      const ratings = await getRatings(accessToken);
      const result = await reconcileRatings(userId, ratings);
      itemsSynced.ratings = summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
    } catch (error) {
      console.error('[TraktSync] Error during ratings sync step (/sync/ratings):', {
        error,
        userId,
      });
      throw error;
    }
  }

  if (shouldSyncWatchlist) {
    try {
      const watchlist = await getWatchlist(accessToken);
      const result = await syncWatchlist(userId, watchlist);
      itemsSynced.watchlistItems =
        summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
      if (result.shouldEnrich) {
        listsToEnrich.push('watchlist');
      }
    } catch (error) {
      console.error('[TraktSync] Error during watchlist sync step (/sync/watchlist):', {
        error,
        userId,
      });
      throw error;
    }
  }

  if (shouldSyncFavorites) {
    try {
      const favorites = await getFavorites(accessToken);
      const result = await syncFavorites(userId, favorites);
      itemsSynced.favorites = summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
      if (result.shouldEnrich) {
        listsToEnrich.push('favorites');
      }
    } catch (error) {
      console.error('[TraktSync] Error during favorites sync step (/sync/favorites):', {
        error,
        userId,
      });
      throw error;
    }
  }

  if (shouldSyncCustomLists) {
    try {
      const userProfile = await getUserProfile(accessToken);
      const traktLists = await getUserLists(accessToken, userProfile.username);
      const customListsResult = await reconcileCustomLists(
        userId,
        accessToken,
        userProfile.username,
        traktLists,
        currentIncrementalState?.customLists ?? {},
        bootstrap
      );

      itemsSynced.lists =
        summaryMode === 'bootstrap'
          ? Object.keys(customListsResult.customLists).length
          : customListsResult.changedCount;
      customListsState = customListsResult.customLists;
      listsToEnrich.push(...customListsResult.listsToEnrich);
    } catch (error) {
      console.error('[TraktSync] Error during custom lists sync step (/users/{username}/lists):', {
        error,
        userId,
      });
      throw error;
    }
  }

  return {
    itemsSynced,
    listsToEnrich: normalizeChangedListIds(listsToEnrich),
    nextIncrementalState: {
      bootstrapCompletedAt: currentIncrementalState?.bootstrapCompletedAt ?? Timestamp.now(),
      customLists: customListsState,
      lastActivities,
      schemaVersion: TRAKT_INCREMENTAL_SCHEMA_VERSION,
      updatedAt: Timestamp.now(),
    },
    summaryMode,
  };
};

export const enqueueSyncRun = async (
  payload: { runId: string; userId: string },
  options?: TraktTaskDispatchOptions
): Promise<void> => {
  await getFunctions()
    .taskQueue<{ runId: string; userId: string }>(TRAKT_SYNC_QUEUE_FUNCTION)
    .enqueue(payload, buildTaskDispatchOptions(options));
};
