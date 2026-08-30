import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import {
  FIRESTORE_INDEX_ENTRY_LIMIT_PATTERN,
  TRAKT_ENRICHMENT_COOLDOWN_MS,
  TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
  TRAKT_INCREMENTAL_SCHEMA_VERSION,
  TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
  TRAKT_SYNC_STORAGE_LIMIT_MESSAGE,
} from './constants';
import { isPlainObject, stripUndefinedDeep } from './transforms';
import {
  EnrichmentCounts,
  EnrichmentResponseBody,
  ListEnrichmentStatusResponse,
  SyncResponseBody,
  SyncStatusItems,
  SyncStatusState,
  SyncSummaryMode,
  TraktEnrichmentStatus,
  TraktIncrementalState,
  TraktOAuthError,
  TraktSyncError,
  TraktSyncStatus,
  TraktUserDoc,
} from './types';

export const getManualSyncCooldownTimestamp = (
  syncStatus?: Partial<TraktSyncStatus> | null
): FirebaseFirestore.Timestamp | undefined => {
  if (!(syncStatus?.nextAllowedSyncAt instanceof Timestamp)) {
    return undefined;
  }

  const shouldEnforceCooldown =
    syncStatus.status === 'completed' ||
    (syncStatus.status === 'failed' && syncStatus.errorCategory === 'rate_limited');

  return shouldEnforceCooldown ? syncStatus.nextAllowedSyncAt : undefined;
};

export const getRateLimitedSyncCooldownTimestamp = (
  error: TraktSyncError
): FirebaseFirestore.Timestamp | undefined =>
  error.category === 'rate_limited' && error.retryAfterSeconds
    ? Timestamp.fromMillis(Date.now() + error.retryAfterSeconds * 1000)
    : undefined;

export const emptyItemsSynced = (): SyncStatusItems => ({
  episodes: 0,
  favorites: 0,
  lists: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchlistItems: 0,
});

export const emptyEnrichmentCounts = (): EnrichmentCounts => ({
  episodes: 0,
  items: 0,
  lists: 0,
});

export const getSyncSummaryMode = (
  incrementalState?: TraktIncrementalState
): SyncSummaryMode =>
  !incrementalState || incrementalState.schemaVersion !== TRAKT_INCREMENTAL_SCHEMA_VERSION
    ? 'bootstrap'
    : 'incremental';

export const toIsoString = (value?: FirebaseFirestore.Timestamp): string | undefined =>
  value instanceof Timestamp ? value.toDate().toISOString() : undefined;

export const serializeSyncStatus = (
  syncStatus?: Partial<TraktSyncStatus> | null
): Omit<SyncResponseBody, 'connected' | 'synced'> | undefined => {
  if (!syncStatus) {
    return undefined;
  }

  return {
    attempt: syncStatus.attempt ?? 0,
    completedAt: toIsoString(syncStatus.completedAt),
    diagnostics: syncStatus.diagnostics,
    errorCategory: syncStatus.errorCategory,
    errorMessage: syncStatus.errorMessage,
    errors: syncStatus.errors ?? [],
    itemsSynced: syncStatus.itemsSynced ?? emptyItemsSynced(),
    lastSyncedAt: toIsoString(syncStatus.lastSyncedAt),
    maxAttempts: syncStatus.maxAttempts ?? TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
    nextAllowedSyncAt: toIsoString(syncStatus.nextAllowedSyncAt),
    nextRetryAt: toIsoString(syncStatus.nextRetryAt),
    runId: syncStatus.runId,
    startedAt: toIsoString(syncStatus.startedAt),
    status: syncStatus.status,
    summaryMode: syncStatus.summaryMode,
  };
};

export const getSyncResponseBody = (userData?: TraktUserDoc | null): SyncResponseBody => {
  const syncStatus = userData?.traktSyncStatus;
  return {
    connected: Boolean(userData?.traktConnected),
    synced: Boolean(syncStatus?.lastSyncedAt),
    ...serializeSyncStatus(syncStatus),
  };
};

export const buildRateLimitedSyncResponse = (
  userData: TraktUserDoc | null | undefined,
  nextAllowedSyncAt: FirebaseFirestore.Timestamp,
  message: string
): SyncResponseBody => {
  const currentStatus = userData?.traktSyncStatus;

  return {
    connected: Boolean(userData?.traktConnected),
    synced: Boolean(currentStatus?.lastSyncedAt),
    ...serializeSyncStatus(currentStatus),
    error: message,
    errorCategory: 'rate_limited',
    errorMessage: message,
    nextAllowedSyncAt: nextAllowedSyncAt.toDate().toISOString(),
  };
};

export const serializeEnrichmentStatus = (
  enrichmentStatus?: Partial<TraktEnrichmentStatus> | null
): Omit<EnrichmentResponseBody, 'lists' | 'status'> & { status?: SyncStatusState } | undefined => {
  if (!enrichmentStatus) {
    return undefined;
  }

  return {
    attempt: enrichmentStatus.attempt ?? 0,
    completedAt: toIsoString(enrichmentStatus.completedAt),
    counts: enrichmentStatus.counts ?? emptyEnrichmentCounts(),
    diagnostics: enrichmentStatus.diagnostics,
    errorCategory: enrichmentStatus.errorCategory,
    errorMessage: enrichmentStatus.errorMessage,
    errors: enrichmentStatus.errors ?? [],
    includeEpisodes: enrichmentStatus.includeEpisodes ?? true,
    maxAttempts: enrichmentStatus.maxAttempts ?? TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
    nextAllowedEnrichAt: toIsoString(enrichmentStatus.nextAllowedEnrichAt),
    nextRetryAt: toIsoString(enrichmentStatus.nextRetryAt),
    runId: enrichmentStatus.runId,
    startedAt: toIsoString(enrichmentStatus.startedAt),
    status: enrichmentStatus.status,
  };
};

export const buildRateLimitedEnrichmentResponse = (
  userData: TraktUserDoc | null | undefined,
  nextAllowedEnrichAt: FirebaseFirestore.Timestamp,
  lists: Record<string, ListEnrichmentStatusResponse>,
  message: string
): EnrichmentResponseBody => {
  const currentStatus = userData?.traktEnrichmentStatus;

  return {
    lists,
    status: currentStatus?.status ?? 'idle',
    ...serializeEnrichmentStatus(currentStatus),
    error: message,
    errorCategory: 'rate_limited',
    errorMessage: message,
    nextAllowedEnrichAt: nextAllowedEnrichAt.toDate().toISOString(),
  };
};

export const sanitizeSyncStatusForWrite = (syncStatus: TraktSyncStatus): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(syncStatus, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt sync status.', 'internal', false);
  }

  return sanitized;
};

export const sanitizeEnrichmentStatusForWrite = (
  enrichmentStatus: TraktEnrichmentStatus
): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(enrichmentStatus, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt enrichment status.', 'internal', false);
  }

  return sanitized;
};

export const sanitizeIncrementalStateForWrite = (
  incrementalState: TraktIncrementalState
): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(incrementalState, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt incremental state.', 'internal', false);
  }

  return sanitized;
};

export const writeSyncStatus = async (userId: string, runId: string, syncStatus: TraktSyncStatus): Promise<void> => {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const runRef = userRef.collection('traktSyncRuns').doc(runId);
  const batch = db.batch();
  const syncStatusForWrite = sanitizeSyncStatusForWrite(syncStatus);

  batch.set(runRef, syncStatusForWrite);
  batch.set(
    userRef,
    {
      traktSyncStatus: syncStatusForWrite,
    },
    { mergeFields: ['traktSyncStatus'] }
  );

  await batch.commit();
};

export const writeCompletedSyncResult = async (
  userId: string,
  runId: string,
  syncStatus: TraktSyncStatus,
  incrementalState: TraktIncrementalState
): Promise<void> => {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const runRef = userRef.collection('traktSyncRuns').doc(runId);
  const batch = db.batch();
  const syncStatusForWrite = sanitizeSyncStatusForWrite(syncStatus);
  const incrementalStateForWrite = sanitizeIncrementalStateForWrite(incrementalState);

  batch.set(runRef, syncStatusForWrite);
  batch.set(
    userRef,
    {
      traktIncrementalState: incrementalStateForWrite,
      traktSyncStatus: syncStatusForWrite,
    },
    { merge: true }
  );

  await batch.commit();
};

export const writeEnrichmentStatus = async (
  userId: string,
  runId: string,
  enrichmentStatus: TraktEnrichmentStatus
): Promise<void> => {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const runRef = userRef.collection('traktEnrichmentRuns').doc(runId);
  const batch = db.batch();
  const enrichmentStatusForWrite = sanitizeEnrichmentStatusForWrite(enrichmentStatus);

  batch.set(runRef, enrichmentStatusForWrite, { merge: true });
  batch.set(
    userRef,
    {
      traktEnrichmentStatus: enrichmentStatusForWrite,
    },
    { merge: true }
  );

  await batch.commit();
};

export const getPreviousLastSyncedAt = (
  currentSyncStatus?: Partial<TraktSyncStatus> | null
): FirebaseFirestore.Timestamp | undefined => {
  if (currentSyncStatus?.lastSyncedAt instanceof Timestamp) {
    return currentSyncStatus.lastSyncedAt;
  }
  return undefined;
};

export const getPreviousEnrichmentCompletedAt = (
  enrichmentStatus?: Partial<TraktEnrichmentStatus> | null
): FirebaseFirestore.Timestamp | undefined => {
  if (enrichmentStatus?.completedAt instanceof Timestamp) {
    return enrichmentStatus.completedAt;
  }
  return undefined;
};

export const createQueuedSyncStatus = (
  userId: string,
  runId: string,
  summaryMode: SyncSummaryMode,
  previousLastSyncedAt?: FirebaseFirestore.Timestamp
): TraktSyncStatus => {
  const now = Timestamp.now();
  return {
    attempt: 0,
    itemsSynced: emptyItemsSynced(),
    lastSyncedAt: previousLastSyncedAt,
    maxAttempts: TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
    runId,
    startedAt: now,
    status: 'queued',
    summaryMode,
    updatedAt: now,
    userId,
  };
};

export const createQueuedEnrichmentStatus = (
  userId: string,
  runId: string,
  listIds: string[],
  includeEpisodes: boolean,
  previousCompletedAt?: FirebaseFirestore.Timestamp
): TraktEnrichmentStatus => {
  const now = Timestamp.now();

  return {
    attempt: 0,
    completedAt: previousCompletedAt,
    counts: emptyEnrichmentCounts(),
    includeEpisodes,
    lists: [...listIds],
    maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
    nextAllowedEnrichAt: Timestamp.fromMillis(Date.now() + TRAKT_ENRICHMENT_COOLDOWN_MS),
    runId,
    startedAt: now,
    status: 'queued',
    updatedAt: now,
    userId,
  };
};

export const createFailureStatus = (
  userId: string,
  runId: string,
  summaryMode: SyncSummaryMode,
  previousLastSyncedAt: FirebaseFirestore.Timestamp | undefined,
  itemsSynced: SyncStatusItems,
  attempt: number,
  status: 'failed' | 'retrying',
  error: TraktSyncError,
  retryReason?: string,
  nextAllowedSyncAt?: FirebaseFirestore.Timestamp
): TraktSyncStatus => {
  const now = Timestamp.now();
  return {
    attempt,
    completedAt: status === 'failed' ? now : undefined,
    diagnostics: {
      cfRay: error.cfRay,
      endpoint: error.endpoint,
      retryAfterSeconds: error.retryAfterSeconds,
      retryReason,
      snippet: error.snippet,
      statusCode: error.statusCode,
    },
    errorCategory: error.category,
    errorMessage: error.message,
    errors: [error.message],
    itemsSynced,
    lastSyncedAt: previousLastSyncedAt,
    maxAttempts: TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
    nextAllowedSyncAt:
      status === 'failed' && error.category === 'rate_limited' ? nextAllowedSyncAt : undefined,
    nextRetryAt:
      status === 'retrying' && error.retryAfterSeconds !== undefined
        ? Timestamp.fromMillis(Date.now() + error.retryAfterSeconds * 1000)
        : undefined,
    runId,
    startedAt: now,
    status,
    summaryMode,
    updatedAt: now,
    userId,
  };
};

export const createFailureEnrichmentStatus = (
  userId: string,
  runId: string,
  listIds: string[],
  includeEpisodes: boolean,
  previousCompletedAt: FirebaseFirestore.Timestamp | undefined,
  counts: EnrichmentCounts,
  attempt: number,
  status: 'failed' | 'retrying',
  error: TraktSyncError,
  retryReason?: string,
  nextAllowedEnrichAt?: FirebaseFirestore.Timestamp
): TraktEnrichmentStatus => {
  const now = Timestamp.now();

  return {
    attempt,
    completedAt: status === 'failed' ? now : previousCompletedAt,
    counts,
    diagnostics: {
      cfRay: error.cfRay,
      endpoint: error.endpoint,
      retryAfterSeconds: error.retryAfterSeconds,
      retryReason,
      snippet: error.snippet,
      statusCode: error.statusCode,
    },
    errorCategory: error.category,
    errorMessage: error.message,
    errors: [error.message],
    includeEpisodes,
    lists: [...listIds],
    maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
    nextAllowedEnrichAt,
    nextRetryAt:
      status === 'retrying' && error.retryAfterSeconds !== undefined
        ? Timestamp.fromMillis(Date.now() + error.retryAfterSeconds * 1000)
        : undefined,
    runId,
    startedAt: now,
    status,
    updatedAt: now,
    userId,
  };
};

export const normalizeSyncError = (error: unknown): TraktSyncError => {
  if (error instanceof TraktSyncError) {
    return error;
  }

  if (error instanceof TraktOAuthError) {
    const category =
      error.reason === 'upstream_blocked'
        ? 'upstream_blocked'
        : error.reason === 'upstream_unavailable'
          ? 'upstream_unavailable'
          : error.reason === 'rate_limited'
            ? 'rate_limited'
            : 'auth_invalid';
    const retryable =
      category === 'upstream_blocked' ||
      category === 'upstream_unavailable' ||
      category === 'rate_limited';
    return new TraktSyncError(error.message, category, retryable, {
      cfRay: error.cfRay,
      snippet: error.snippet,
      statusCode: error.statusCode,
    });
  }

  if (error instanceof Error) {
    if (FIRESTORE_INDEX_ENTRY_LIMIT_PATTERN.test(error.message)) {
      return new TraktSyncError(TRAKT_SYNC_STORAGE_LIMIT_MESSAGE, 'storage_limit', false, {
        snippet: error.message,
      });
    }

    return new TraktSyncError(error.message, 'internal', false);
  }

  return new TraktSyncError('Unknown Trakt sync error.', 'internal', false);
};
