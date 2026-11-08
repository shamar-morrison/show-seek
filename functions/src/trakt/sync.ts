import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  commitEpisodeWrites,
  emptyEpisodeTracking,
  planEpisodeWrites,
  withEpisodePages,
} from '../episodePagesAdmin';
import {
  commitPagedListWrites,
  deletePagedList,
  planPagedListWrites,
  readPagedList,
  withPages,
  type ListItemChanges,
} from '../listPagesAdmin';
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
  fetchTMDBJson,
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
  TMDBShowDetails,
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
import { TraktOAuthError, TraktSyncError } from './types';

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

/**
 * Disconnects Trakt after a rejected refresh, but only if the stored refresh token is still the one
 * that was rejected. A different stored token means another run already refreshed successfully.
 */
export const clearTraktTokensIfRefreshTokenUnchanged = async (
  userId: string,
  usedRefreshToken: string
): Promise<boolean> => {
  if (!usedRefreshToken) {
    return false;
  }

  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const userData = (snapshot.data() ?? {}) as TraktUserDoc;

    if (userData.traktRefreshToken !== usedRefreshToken) {
      return false;
    }

    transaction.set(
      userRef,
      {
        traktAccessToken: FieldValue.delete(),
        traktConnected: false,
        // Lets a retry of this run report reauth_required instead of a generic disconnect.
        traktReauthRequired: true,
        traktRefreshToken: FieldValue.delete(),
        traktTokenExpiresAt: FieldValue.delete(),
      },
      { merge: true }
    );
    return true;
  });
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
  // Items of a large list are spread over overflow pages; reconcile against all of them.
  const pagedList = existingSnapshot
    ? await withPages(existingSnapshot, undefined, listRef)
    : await readPagedList(listRef);
  const snapshot = { exists: pagedList.exists };
  const existingData = pagedList.data as Record<string, unknown>;
  const existingItemsRaw = pagedList.exists
    ? (pagedList.items as Record<string, unknown>)
    : undefined;
  const existingItems = normalizeStoredListItems(existingItemsRaw);
  const itemSets: Record<string, Record<string, unknown>> = {};
  const itemDeletes = new Set<string>();
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
      itemSets[remoteKey] = nextItem;
      hasItemWrites = true;
      if (isRemoteChange) {
        changedMediaTypes.push(mediaType);
        changedCount += 1;
        addedOrUpdatedCount += 1;
      }
    }

    if (hasLegacyKey) {
      itemDeletes.add(legacyKey);
      hasItemWrites = true;
    }
  });

  if (!preserveLocalItems) {
    Object.entries(existingItems).forEach(([existingKey, existingItem]) => {
      if (remoteItems[existingKey]) {
        return;
      }

      itemDeletes.add(existingKey);
      hasItemWrites = true;

      const mediaType = existingItem.media_type;
      const mediaId = existingItem.id;
      if (isListMediaType(mediaType)) {
        changedMediaTypes.push(mediaType);
      }
      if (typeof mediaId === 'number' && existingItemsRaw) {
        const legacyKey = getLegacyListItemKey(mediaId);
        if (legacyKey !== existingKey && legacyKey in existingItemsRaw) {
          itemDeletes.add(legacyKey);
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
      shouldEnrich: nextNeedsEnrichment,
    };
  }

  const listFields = stripUndefinedDeep(
    {
      ...baseData,
      // A new list document still needs an items map, even when every item goes to a page.
      ...(!snapshot.exists ? { items: {} } : {}),
      metadata: {
        ...existingMetadata,
        itemCount: nextItemCount,
        lastUpdated: Timestamp.now(),
        needsEnrichment: nextNeedsEnrichment,
      },
    },
    true
  ) as Record<string, unknown>;
  const itemWrites: ListItemChanges = {
    delete: [...itemDeletes],
    set: Object.fromEntries(
      Object.entries(itemSets).map(([key, value]) => [
        key,
        stripUndefinedDeep(value, true) as Record<string, unknown>,
      ])
    ),
  };
  const plan = planPagedListWrites(pagedList, itemWrites);
  if (!snapshot.exists && plan.pageItems.has(0)) {
    // planPagedListWrites puts page-0 items in their own `items` field; keep the empty map out.
    delete listFields.items;
  }

  await commitPagedListWrites(admin.firestore(), pagedList, plan, listFields);

  return {
    changedCount,
    changedMediaTypes,
    didRemoteChange,
    didWrite: true,
    shouldEnrich: nextNeedsEnrichment,
  };
};

/**
 * A write batch that commits every 400 writes, staying under Firestore's 500-writes-per-batch
 * limit however many shows or ratings a sync touches. `commit()` flushes the rest.
 */
const createChunkedBatch = (db: FirebaseFirestore.Firestore) => {
  let batch = db.batch();
  let size = 0;
  const commits: Promise<unknown>[] = [];
  return {
    set(
      ref: FirebaseFirestore.DocumentReference,
      data: FirebaseFirestore.DocumentData,
      options: FirebaseFirestore.SetOptions
    ) {
      batch.set(ref, data, options);
      size += 1;
      if (size >= 400) {
        commits.push(batch.commit());
        batch = db.batch();
        size = 0;
      }
    },
    async commit() {
      if (size > 0) {
        commits.push(batch.commit());
      }
      await Promise.all(commits);
    },
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
  const batch = createChunkedBatch(db);
  let changedEpisodes = 0;
  let importedEpisodes = 0;

  for (const traktShow of traktShows) {
    const remoteDoc = buildEpisodeTrackingDoc(traktShow);
    if (!remoteDoc) {
      continue;
    }

    const existingDoc = existingDocs.get(remoteDoc.showId);
    if (!existingDoc) {
      const showIdNumber = Number(remoteDoc.showId);
      if (Number.isFinite(showIdNumber)) {
        try {
          const tmdbShow = await fetchTMDBJson<TMDBShowDetails>(`/tv/${showIdNumber}`);
          if (!tmdbShow) {
            console.warn(
              `[TraktSync] Skipping unresolvable TMDB TV show ID ${remoteDoc.showId} ("${remoteDoc.metadata.tvShowName}"): show not found on TMDB (404)`
            );
            continue;
          }
        } catch (error) {
          // Transient TMDB failures (timeouts, 429s, 5xx) fail open: the show
          // still syncs and a later run can re-verify it. Configuration errors
          // (missing TMDB_API_KEY secret, 401/403) fail deterministically on
          // every call, so failing open would silently disable this validation
          // for all shows — log at error level so it pages/alerts instead.
          if (error instanceof TraktSyncError && !error.retryable) {
            console.error(
              `[TraktSync] TMDB existence validation is misconfigured; cannot verify show ${remoteDoc.showId} ("${remoteDoc.metadata.tvShowName}"). ` +
                `Failing open. Investigate immediately. category=${error.category} statusCode=${error.statusCode ?? 'unknown'} message=${error.message}`
            );
          } else {
            console.warn(
              `[TraktSync] Could not verify TMDB existence for show ${remoteDoc.showId} ("${remoteDoc.metadata.tvShowName}"):`,
              error
            );
          }
        }
      }
    }

    importedEpisodes += Object.keys(remoteDoc.episodes).length;
    // Very long shows keep their episodes across overflow pages; compare against all of them.
    const tracking = existingDoc
      ? await withEpisodePages(existingDoc)
      : emptyEpisodeTracking(collectionRef.doc(remoteDoc.showId));
    const existingData = tracking.data as Record<string, unknown>;
    const existingEpisodes = tracking.items;
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
      const metadata = { ...existingMetadata, ...metadataBase, lastUpdated: Timestamp.now() };
      const plan = planEpisodeWrites(tracking, {
        set: stripUndefinedDeep(episodeChanges, true) as Record<string, Record<string, unknown>>,
      });

      if (tracking.layout.pageCount === 0 && !plan.createsPages) {
        // Fits in the show's document: batched as before.
        batch.set(
          tracking.ref,
          stripUndefinedDeep(
            {
              episodes: plan.pageItems.get(0) ?? (!existingDoc ? {} : undefined),
              metadata,
            },
            true
          ) as FirebaseFirestore.DocumentData,
          { merge: true }
        );
      } else {
        await commitEpisodeWrites(
          db,
          tracking,
          plan,
          stripUndefinedDeep(
            { ...(!existingDoc ? { episodes: {} } : {}), metadata },
            true
          ) as Record<string, unknown>
        );
      }
    }

    existingDocs.delete(remoteDoc.showId);
  }

  await batch.commit();

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

  const batch = createChunkedBatch(db);
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
    }

    existingDocs.delete(docId);
  });

  await batch.commit();

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
    // Deletes each list with its overflow pages.
    await Promise.all(removedLocalLists.map((doc) => deletePagedList(admin.firestore(), doc.ref)));
    changedCount += removedLocalLists.length;
  }

  return {
    changedCount,
    customLists: nextCustomLists,
    listsToEnrich: normalizeChangedListIds(listsToEnrich),
  };
};

/**
 * Errors from Trakt itself (auth, rate limits, outages) would fail every remaining sync step,
 * so they end the run immediately. Anything else (a Firestore write, TMDB) only fails its step.
 */
export const isRunFatalSyncError = (error: unknown): boolean => {
  if (error instanceof TraktOAuthError) {
    return true;
  }
  if (error instanceof TraktSyncError) {
    return error.category !== 'internal' && error.category !== 'storage_limit';
  }
  return false;
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
  // A step that fails for a ShowSeek-side reason (e.g. a Firestore write) must not stop the
  // others from syncing. Trakt-side failures stop the run: every later step would hit them too.
  const stepFailures: unknown[] = [];
  const recordStepFailure = (error: unknown): void => {
    if (isRunFatalSyncError(error)) {
      throw error;
    }
    stepFailures.push(error);
  };

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
      recordStepFailure(error);
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
      recordStepFailure(error);
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
      recordStepFailure(error);
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
      recordStepFailure(error);
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
      recordStepFailure(error);
    }
  }

  if (stepFailures.length > 0) {
    // Fail the run so the incremental state isn't advanced: the next sync retries every step,
    // and the steps that already succeeded are no-ops the second time.
    throw stepFailures[0];
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
