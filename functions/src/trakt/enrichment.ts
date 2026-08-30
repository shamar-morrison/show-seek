import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import type { TaskOptions } from 'firebase-admin/functions';
import { Timestamp } from 'firebase-admin/firestore';
import {
  ACTIVE_RUN_STATUSES,
  DEFAULT_ENRICHMENT_LIST_IDS,
  TRAKT_ENRICHMENT_QUEUE_FUNCTION,
  TRAKT_SYNC_QUEUE_DEADLINE_SECONDS,
} from './constants';
import { fetchTMDBJson } from './client';
import {
  createFailureEnrichmentStatus,
  createQueuedEnrichmentStatus,
  emptyEnrichmentCounts,
  getPreviousEnrichmentCompletedAt,
  sanitizeEnrichmentStatusForWrite,
  serializeEnrichmentStatus,
  toIsoString,
  writeEnrichmentStatus,
} from './status';
import { normalizeListIds } from './transforms';
import type {
  EnrichmentCounts,
  EnrichmentResponseBody,
  EnrichmentTaskPayload,
  ListEnrichmentStatusResponse,
  SyncTaskPayload,
  TMDBMovieDetails,
  TMDBSeasonResponse,
  TMDBShowDetails,
  TraktEnrichmentStatus,
  TraktTaskDispatchOptions,
  TraktUserDoc,
} from './types';
import { TraktSyncError } from './types';

export const buildTaskDispatchOptions = ({
  scheduleDelaySeconds,
  taskId,
}: TraktTaskDispatchOptions = {}): TaskOptions => {
  const options: TaskOptions = {
    dispatchDeadlineSeconds: TRAKT_SYNC_QUEUE_DEADLINE_SECONDS,
  };

  if (scheduleDelaySeconds !== undefined) {
    options.scheduleDelaySeconds = scheduleDelaySeconds;
  }

  if (taskId) {
    options.id = taskId;
  }

  return options;
};

export const parseTaskPayload = (payload: SyncTaskPayload): { runId: string; userId: string } => {
  if (typeof payload.runId !== 'string' || payload.runId.trim() === '') {
    throw new TraktSyncError('Sync task is missing a valid runId.', 'internal', false);
  }
  if (typeof payload.userId !== 'string' || payload.userId.trim() === '') {
    throw new TraktSyncError('Sync task is missing a valid userId.', 'internal', false);
  }

  return {
    runId: payload.runId.trim(),
    userId: payload.userId.trim(),
  };
};

export const parseEnrichmentTaskPayload = (
  payload: EnrichmentTaskPayload
): { includeEpisodes: boolean; lists: string[]; runId: string; userId: string } => {
  const { runId, userId } = parseTaskPayload(payload);
  const includeEpisodes = payload.includeEpisodes !== false;
  const lists =
    Array.isArray(payload.lists) && payload.lists.every((listId) => typeof listId === 'string')
      ? normalizeListIds(payload.lists as string[])
      : [...DEFAULT_ENRICHMENT_LIST_IDS];

  return {
    includeEpisodes,
    lists,
    runId,
    userId,
  };
};

export const enqueueEnrichmentRun = async (
  payload: {
    includeEpisodes: boolean;
    lists: string[];
    runId: string;
    userId: string;
  },
  options?: TraktTaskDispatchOptions
): Promise<void> => {
  await getFunctions()
    .taskQueue<{
      includeEpisodes: boolean;
      lists: string[];
      runId: string;
      userId: string;
    }>(TRAKT_ENRICHMENT_QUEUE_FUNCTION)
    .enqueue(payload, buildTaskDispatchOptions(options));
};

export const resolveEnrichmentListIds = async (
  userId: string,
  requestedListIds?: string[]
): Promise<string[]> => {
  if (requestedListIds && requestedListIds.length > 0) {
    return normalizeListIds(requestedListIds);
  }

  const customPendingListIds = new Set<string>();
  const snapshot = await admin.firestore().collection('users').doc(userId).collection('lists').get();

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as { isCustom?: boolean; metadata?: { needsEnrichment?: boolean } };
    if (data.isCustom && data.metadata?.needsEnrichment) {
      customPendingListIds.add(doc.id);
    }
  });

  return normalizeListIds([...DEFAULT_ENRICHMENT_LIST_IDS, ...customPendingListIds]);
};

export const getEnrichmentListStatuses = async (
  userId: string
): Promise<Record<string, ListEnrichmentStatusResponse>> => {
  const snapshot = await admin.firestore().collection('users').doc(userId).collection('lists').get();
  const listsStatus: Record<string, ListEnrichmentStatusResponse> = {};

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const items = (data?.items ?? {}) as Record<string, Record<string, unknown>>;
    const metadata = (data?.metadata ?? {}) as {
      lastEnriched?: FirebaseFirestore.Timestamp;
      needsEnrichment?: boolean;
    };

    listsStatus[doc.id] = {
      exists: true,
      hasPosters: Object.values(items).some((item) => Boolean(item.poster_path)),
      itemCount: Object.keys(items).length,
      lastEnriched: toIsoString(metadata.lastEnriched),
      needsEnrichment: Boolean(metadata.needsEnrichment),
    };
  });

  DEFAULT_ENRICHMENT_LIST_IDS.forEach((listId) => {
    if (!listsStatus[listId]) {
      listsStatus[listId] = { exists: false };
    }
  });

  return listsStatus;
};

export const enrichMediaItem = async (item: Record<string, unknown>): Promise<Record<string, unknown>> => {
  if (!item || typeof item.id !== 'number' || typeof item.media_type !== 'string') {
    return item;
  }

  const enrichedItem = { ...item };
  if (item.media_type === 'movie') {
    const movie = await fetchTMDBJson<TMDBMovieDetails>(`/movie/${item.id}`);
    if (movie) {
      enrichedItem.poster_path = movie.poster_path;
      enrichedItem.vote_average = movie.vote_average;
      enrichedItem.genre_ids = movie.genre_ids ?? [];
      if (!enrichedItem.release_date) {
        enrichedItem.release_date = movie.release_date;
      }
      if (!enrichedItem.title) {
        enrichedItem.title = movie.title;
      }
    }
  } else if (item.media_type === 'tv') {
    const show = await fetchTMDBJson<TMDBShowDetails>(`/tv/${item.id}`);
    if (show) {
      enrichedItem.poster_path = show.poster_path;
      enrichedItem.vote_average = show.vote_average;
      enrichedItem.genre_ids = show.genre_ids ?? [];
      if (!enrichedItem.first_air_date) {
        enrichedItem.first_air_date = show.first_air_date;
      }
      if (!enrichedItem.name) {
        enrichedItem.name = show.name;
      }
    }
  }

  return enrichedItem;
};

export const enrichMediaItems = async (
  items: Record<string, Record<string, unknown>>,
  batchSize = 5,
  delayMs = 250
): Promise<Record<string, Record<string, unknown>>> => {
  const enrichedItems: Record<string, Record<string, unknown>> = {};
  const itemKeys = Object.keys(items);

  for (let index = 0; index < itemKeys.length; index += batchSize) {
    const batch = itemKeys.slice(index, index + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (key) => {
        const enriched = await enrichMediaItem(items[key]);
        return { item: enriched, key };
      })
    );

    batchResults.forEach(({ item, key }) => {
      enrichedItems[key] = item;
    });

    if (index + batchSize < itemKeys.length) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return enrichedItems;
};

export const enrichEpisodeTracking = async (
  showId: number,
  episodes: Record<string, Record<string, unknown>>
): Promise<Record<string, Record<string, unknown>>> => {
  const bySeason: Record<string, string[]> = {};
  Object.keys(episodes).forEach((key) => {
    const [season] = key.split('_');
    if (!bySeason[season]) {
      bySeason[season] = [];
    }
    bySeason[season].push(key);
  });

  const enrichedEpisodes: Record<string, Record<string, unknown>> = { ...episodes };

  for (const [seasonNumber, keys] of Object.entries(bySeason)) {
    const seasonData = await fetchTMDBJson<TMDBSeasonResponse>(`/tv/${showId}/season/${seasonNumber}`);
    if (!seasonData) {
      continue;
    }

    const seasonEpisodeMap = seasonData.episodes.reduce<Record<string, TMDBSeasonResponse['episodes'][number]>>(
      (accumulator, episode) => {
        accumulator[String(episode.episode_number)] = episode;
        return accumulator;
      },
      {}
    );

    for (const key of keys) {
      const [, episodeNumberString] = key.split('_');
      const tmdbEpisode = seasonEpisodeMap[episodeNumberString];
      const episode = episodes[key];

      if (!tmdbEpisode) {
        continue;
      }

      let watchedAt = episode.watchedAt;
      if (typeof watchedAt === 'number') {
        watchedAt = Timestamp.fromMillis(watchedAt);
      } else if (typeof watchedAt === 'string') {
        const parsedDate = new Date(watchedAt);
        if (Number.isNaN(parsedDate.getTime())) {
          console.warn('[TraktEnrichment] Invalid watchedAt string, defaulting to now.', {
            episodeKey: key,
            seasonNumber,
            showId,
            watchedAt,
          });
          watchedAt = Timestamp.now();
        } else {
          watchedAt = Timestamp.fromDate(parsedDate);
        }
      }

      enrichedEpisodes[key] = {
        ...episode,
        episodeAirDate: tmdbEpisode.air_date,
        episodeId: tmdbEpisode.id,
        episodeName: tmdbEpisode.name,
        episodeNumber: Number(episodeNumberString),
        seasonNumber: Number(seasonNumber),
        tvShowId: showId,
        watchedAt,
      };
    }
  }

  return enrichedEpisodes;
};

export const runTraktEnrichmentJob = async (
  userId: string,
  listIds: string[],
  includeEpisodes: boolean,
  runId: string
): Promise<EnrichmentCounts> => {
  const enrichedCounts = emptyEnrichmentCounts();
  const db = admin.firestore();

  for (const listId of listIds) {
    const listRef = db.collection('users').doc(userId).collection('lists').doc(listId);
    const listSnapshot = await listRef.get();
    if (!listSnapshot.exists) {
      continue;
    }

    const listData = listSnapshot.data();
    const currentItems = (listData?.items ?? {}) as Record<string, Record<string, unknown>>;
    const enrichedItems = Object.keys(currentItems).length > 0 ? await enrichMediaItems(currentItems) : currentItems;

    await listRef.set(
      {
        items: enrichedItems,
        metadata: {
          ...(listData?.metadata ?? {}),
          lastEnriched: Timestamp.now(),
          needsEnrichment: false,
        },
      },
      { merge: true }
    );

    enrichedCounts.items += Object.keys(enrichedItems).length;
    enrichedCounts.lists++;
  }

  if (!includeEpisodes) {
    console.info('[TraktEnrichment] Skipping episode tracking scan for list-only enrichment', {
      counts: enrichedCounts,
      episodeTrackingSnapshot: {
        size: 0,
      },
      includeEpisodes,
      listCount: listIds.length,
      runId,
      userId,
    });
    return enrichedCounts;
  }

  const episodeTrackingSnapshot = await db
    .collection('users')
    .doc(userId)
    .collection('episode_tracking')
    .get();
  const episodeTrackingSnapshotSize = episodeTrackingSnapshot.size;

  console.info('[TraktEnrichment] Loaded episode tracking snapshot', {
    episodeTrackingSnapshot: {
      size: episodeTrackingSnapshotSize,
    },
    includeEpisodes,
    listCount: listIds.length,
    runId,
    userId,
  });

  for (const episodeDoc of episodeTrackingSnapshot.docs) {
    const showId = Number(episodeDoc.id);
    if (!Number.isFinite(showId)) {
      continue;
    }

    const episodeData = episodeDoc.data();
    const currentEpisodes = (episodeData.episodes ?? {}) as Record<string, Record<string, unknown>>;
    if (Object.keys(currentEpisodes).length === 0) {
      continue;
    }

    const enrichedEpisodes = await enrichEpisodeTracking(showId, currentEpisodes);
    await episodeDoc.ref.set(
      {
        episodes: enrichedEpisodes,
        metadata: {
          ...(episodeData.metadata ?? {}),
          lastEnriched: Timestamp.now(),
        },
      },
      { merge: true }
    );

    enrichedCounts.episodes += Object.keys(enrichedEpisodes).length;
  }

  console.info('[TraktEnrichment] Completed enrichment job', {
    counts: enrichedCounts,
    episodeTrackingSnapshot: {
      size: episodeTrackingSnapshotSize,
    },
    includeEpisodes,
    listCount: listIds.length,
    runId,
    userId,
  });

  return enrichedCounts;
};

export const buildEnrichmentResponseBody = async (
  userId: string,
  userData?: TraktUserDoc | null
): Promise<EnrichmentResponseBody> => {
  let resolvedUserData = userData;
  if (!resolvedUserData) {
    const userSnapshot = await admin.firestore().collection('users').doc(userId).get();
    resolvedUserData = (userSnapshot.data() ?? {}) as TraktUserDoc;
  }

  const lists = await getEnrichmentListStatuses(userId);
  const enrichmentStatus = resolvedUserData?.traktEnrichmentStatus;

  return {
    lists,
    status: enrichmentStatus?.status ?? 'idle',
    ...serializeEnrichmentStatus(enrichmentStatus),
  };
};

export const prepareEnrichmentRun = async (
  userId: string,
  requestedListIds?: string[],
  includeEpisodes = true
): Promise<
  | { kind: 'active'; status: Partial<TraktEnrichmentStatus>; userData: TraktUserDoc }
  | { kind: 'queued'; status: TraktEnrichmentStatus }
  | { kind: 'rate_limited'; nextAllowedEnrichAt: FirebaseFirestore.Timestamp; userData: TraktUserDoc }
> => {
  const listIds = await resolveEnrichmentListIds(userId, requestedListIds);
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const runRef = userRef.collection('traktEnrichmentRuns').doc();

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const existingStatus = userData.traktEnrichmentStatus;

    if (existingStatus?.status && ACTIVE_RUN_STATUSES.has(existingStatus.status)) {
      return {
        kind: 'active' as const,
        status: existingStatus,
        userData,
      };
    }

    const nextAllowedEnrichAt = existingStatus?.nextAllowedEnrichAt;
    if (nextAllowedEnrichAt instanceof Timestamp && nextAllowedEnrichAt.toMillis() > Date.now()) {
      return {
        kind: 'rate_limited' as const,
        nextAllowedEnrichAt,
        userData,
      };
    }

    const queuedStatus = createQueuedEnrichmentStatus(
      userId,
      runRef.id,
      listIds,
      includeEpisodes,
      getPreviousEnrichmentCompletedAt(existingStatus)
    );
    const queuedStatusForWrite = sanitizeEnrichmentStatusForWrite(queuedStatus);

    transaction.set(runRef, queuedStatusForWrite, { merge: true });
    transaction.set(
      userRef,
      {
        traktEnrichmentStatus: queuedStatusForWrite,
      },
      { merge: true }
    );

    return {
      kind: 'queued' as const,
      status: queuedStatus,
    };
  });
};

export const dispatchEnrichmentRun = async (status: TraktEnrichmentStatus): Promise<void> => {
  try {
    await enqueueEnrichmentRun(
      {
        includeEpisodes: status.includeEpisodes,
        lists: status.lists,
        runId: status.runId,
        userId: status.userId,
      },
      { taskId: status.runId }
    );
  } catch (error) {
    console.error('[Trakt] Failed to enqueue enrichment task:', error);

    await writeEnrichmentStatus(
      status.userId,
      status.runId,
      createFailureEnrichmentStatus(
        status.userId,
        status.runId,
        status.lists,
        status.includeEpisodes,
        status.completedAt,
        emptyEnrichmentCounts(),
        0,
        'failed',
        new TraktSyncError('Failed to enqueue TMDB enrichment.', 'internal', false),
        undefined,
        status.nextAllowedEnrichAt
      )
    );

    throw error;
  }
};
