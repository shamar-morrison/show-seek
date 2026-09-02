import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched, type Request as TaskRequest } from 'firebase-functions/v2/tasks';
import {
  buildTraktZipImportDocPath,
  buildTraktZipImportStoragePath,
  MAX_ZIP_SIZE_BYTES,
  TRAKT_ZIP_IMPORT_QUEUE_DEADLINE_SECONDS,
  TRAKT_ZIP_IMPORT_QUEUE_FUNCTION,
  TRAKT_ZIP_IMPORT_QUEUE_REGION,
} from './constants';
import { dispatchEnrichmentRun, prepareEnrichmentRun } from './enrichment';
import { isZipImportActive, isZipImportStatusStale } from './status';
import type {
  StartTraktZipImportRequest,
  TraktUserDoc,
  TraktZipImportTaskPayload,
} from './types';
import { parseTraktZipBuffer } from './zipParser';
import { syncTraktZipImport } from './zipSync';

/**
 * Asserts that the authenticated user has an active Premium entitlement before permitting import.
 */
export const assertPremiumUser = async (
  db: FirebaseFirestore.Firestore,
  userId: string
): Promise<void> => {
  const userDoc = await db.collection('users').doc(userId).get();
  const userData = userDoc.data() as { premium?: { isPremium?: boolean } } | undefined;

  if (!userData?.premium?.isPremium) {
    throw new HttpsError('permission-denied', 'Trakt zip import requires Premium.');
  }
};

/**
 * Callable endpoint to validate pre-conditions, register the import progress doc,
 * and dispatch the background processing task.
 */
export const startTraktZipImportHandler = async (
  request: CallableRequest<StartTraktZipImportRequest>
): Promise<{ importId: string }> => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to start a Trakt import.');
  }

  const userId = request.auth.uid;
  const importId = request.data?.importId?.trim();

  const IMPORT_ID_REGEX = /^zip_[a-z0-9]+_[a-z0-9]+$/;
  if (!importId || !IMPORT_ID_REGEX.test(importId)) {
    throw new HttpsError('invalid-argument', 'Missing or invalid importId format.');
  }

  const storagePath = buildTraktZipImportStoragePath(userId, importId);
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new HttpsError(
      'not-found',
      'Import archive not found in storage. Please upload the zip before starting import.'
    );
  }

  const db = admin.firestore();
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userDocRef);
    const userData = (userDoc.data() ?? {}) as TraktUserDoc & { premium?: { isPremium?: boolean } };

    if (!userData?.premium?.isPremium) {
      throw new HttpsError('permission-denied', 'Trakt zip import requires Premium.');
    }

    const activeSync = userData.traktSyncStatus?.status;
    if (activeSync === 'queued' || activeSync === 'in_progress' || activeSync === 'retrying') {
      throw new HttpsError('already-exists', 'A Trakt sync is already in progress.');
    }

    const activeZip = userData.traktZipImportStatus;
    if (isZipImportActive(activeZip)) {
      throw new HttpsError('already-exists', 'A Trakt zip import is already in progress.');
    }

    transaction.set(progressDocRef, {
      createdAt: now,
      id: importId,
      progress: {
        current: 0,
        phase: 'pending',
        total: 100,
      },
      stats: {
        customLists: 0,
        episodes: 0,
        favorites: 0,
        movies: 0,
        movieWatches: 0,
        ratings: 0,
        shows: 0,
        watchlist: 0,
      },
      status: 'pending',
      updatedAt: now,
      userId,
    });

    transaction.set(
      userDocRef,
      {
        traktZipImportStatus: {
          createdAt: now,
          id: importId,
          phase: 'pending',
          status: 'pending',
          updatedAt: now,
        },
      },
      { merge: true }
    );
  });

  try {
    await getFunctions()
      .taskQueue<TraktZipImportTaskPayload>(TRAKT_ZIP_IMPORT_QUEUE_FUNCTION)
      .enqueue(
        { importId, userId },
        {
          dispatchDeadlineSeconds: TRAKT_ZIP_IMPORT_QUEUE_DEADLINE_SECONDS,
          id: `zip_import_${importId}`,
        }
      );
  } catch (enqueueError) {
    console.error('[startTraktZipImport] Task enqueue failed:', enqueueError);
    const failureNow = Timestamp.now();
    const failurePayload = {
      error: 'Failed to enqueue background processing task.',
      failedAt: failureNow,
      status: 'failed' as const,
      updatedAt: failureNow,
    };

    // Attempt durable cleanup with retries
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await Promise.all([
          progressDocRef.set(failurePayload, { merge: true }),
          userDocRef.set(
            {
              traktZipImportStatus: {
                ...failurePayload,
                id: importId,
                phase: 'failed' as const,
              },
            },
            { merge: true }
          ),
        ]);
        break;
      } catch (cleanupError) {
        console.error(
          `[startTraktZipImport] Error during failure cleanup (attempt ${attempt}):`,
          cleanupError
        );
        if (attempt === 2) {
          console.error(
            `[startTraktZipImport] CRITICAL: Failed to write failure status for import ${importId} user ${userId}. Stale recovery will reclaim on subsequent requests.`
          );
        }
      }
    }

    if (enqueueError instanceof HttpsError) {
      throw enqueueError;
    }
    throw new HttpsError('internal', 'Failed to start background import task. Please try again.');
  }

  return { importId };
};

export interface ClaimLeaseResult {
  activeImportId?: string;
  claimed: boolean;
  reason?: 'obsolete_id' | 'duplicate_active_lease' | 'already_completed';
}

export const claimZipImportLease = async (
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  leaseToken: string
): Promise<ClaimLeaseResult> => {
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userDocRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentZipStatus = userData.traktZipImportStatus;

    if (currentZipStatus?.id && currentZipStatus.id !== importId) {
      return { activeImportId: currentZipStatus.id, claimed: false, reason: 'obsolete_id' };
    }

    if (currentZipStatus?.id === importId && currentZipStatus.status === 'completed') {
      return { activeImportId: currentZipStatus.id, claimed: false, reason: 'already_completed' };
    }

    if (
      currentZipStatus?.id === importId &&
      currentZipStatus.status === 'processing' &&
      !isZipImportStatusStale(currentZipStatus)
    ) {
      return { activeImportId: currentZipStatus.id, claimed: false, reason: 'duplicate_active_lease' };
    }

    const downloadTime = Timestamp.now();
    transaction.set(
      progressDocRef,
      {
        leaseToken,
        progress: { current: 10, phase: 'downloading', total: 100 },
        status: 'processing',
        updatedAt: downloadTime,
      },
      { merge: true }
    );
    transaction.set(
      userDocRef,
      {
        traktZipImportStatus: {
          id: importId,
          leaseToken,
          phase: 'downloading',
          status: 'processing',
          updatedAt: downloadTime,
        },
      },
      { merge: true }
    );

    return { claimed: true };
  });
};

export const updateZipImportProgressWithLease = async (
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  leaseToken: string,
  options: {
    percent: number;
    phase: 'downloading' | 'parsing' | 'syncing';
    updatedAt: FirebaseFirestore.Timestamp;
  }
): Promise<boolean> => {
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userDocRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentZipStatus = userData.traktZipImportStatus;

    if (currentZipStatus?.id !== importId || currentZipStatus?.leaseToken !== leaseToken) {
      return false;
    }

    transaction.set(
      progressDocRef,
      {
        leaseToken,
        progress: { current: options.percent, phase: options.phase, total: 100 },
        status: 'processing',
        updatedAt: options.updatedAt,
      },
      { merge: true }
    );
    transaction.set(
      userDocRef,
      {
        traktZipImportStatus: {
          id: importId,
          leaseToken,
          phase: options.phase,
          status: 'processing',
          updatedAt: options.updatedAt,
        },
      },
      { merge: true }
    );

    return true;
  });
};

export const verifyZipImportLeaseOwnership = async (
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  leaseToken: string
): Promise<boolean> => {
  const userSnapshot = await db.collection('users').doc(userId).get();
  const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
  const currentZipStatus = userData.traktZipImportStatus;

  return currentZipStatus?.id === importId && currentZipStatus?.leaseToken === leaseToken;
};

export const completeZipImportWithLease = async (
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  leaseToken: string,
  options: {
    completedAt: FirebaseFirestore.Timestamp;
    stats: {
      customLists: number;
      episodes: number;
      favorites: number;
      movies: number;
      movieWatches: number;
      ratings: number;
      shows: number;
      watchlist: number;
    };
  }
): Promise<boolean> => {
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userDocRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentZipStatus = userData.traktZipImportStatus;

    if (currentZipStatus?.id !== importId || currentZipStatus?.leaseToken !== leaseToken) {
      return false;
    }

    transaction.set(
      progressDocRef,
      {
        completedAt: options.completedAt,
        leaseToken,
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: options.stats,
        status: 'completed',
        updatedAt: options.completedAt,
      },
      { merge: true }
    );
    transaction.set(
      userDocRef,
      {
        traktZipImportStatus: {
          completedAt: options.completedAt,
          id: importId,
          leaseToken,
          phase: 'completed',
          stats: options.stats,
          status: 'completed',
          updatedAt: options.completedAt,
        },
      },
      { merge: true }
    );

    return true;
  });
};

export const failZipImportWithLease = async (
  db: FirebaseFirestore.Firestore,
  userId: string,
  importId: string,
  leaseToken: string,
  options: {
    error: string;
    failedAt: FirebaseFirestore.Timestamp;
  }
): Promise<boolean> => {
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));

  await progressDocRef.set(
    {
      error: options.error,
      failedAt: options.failedAt,
      progress: {
        phase: 'failed',
      },
      status: 'failed',
      updatedAt: options.failedAt,
    },
    { merge: true }
  ).catch((err) => {
    console.error('[runTraktZipImport] Failed to update progressDoc on failure:', err);
  });

  return db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userDocRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentZipStatus = userData.traktZipImportStatus;

    if (currentZipStatus?.id !== importId || currentZipStatus?.leaseToken !== leaseToken) {
      return false;
    }

    transaction.set(
      userDocRef,
      {
        traktZipImportStatus: {
          error: options.error,
          failedAt: options.failedAt,
          id: importId,
          leaseToken,
          phase: 'failed',
          status: 'failed',
          updatedAt: options.failedAt,
        },
      },
      { merge: true }
    );

    return true;
  }).catch((err) => {
    console.error('[runTraktZipImport] Failed to update userDoc on failure:', err);
    return false;
  });
};

/**
 * Background Cloud Task handler that processes the uploaded Trakt zip archive end-to-end.
 */
export const runTraktZipImportHandler = async (
  request: TaskRequest<TraktZipImportTaskPayload>
): Promise<void> => {
  const { importId, userId } = request.data || {};
  if (!importId || !userId) {
    console.error('[runTraktZipImport] Missing importId or userId in task payload');
    return;
  }

  const db = admin.firestore();
  const storagePath = buildTraktZipImportStoragePath(userId, importId);
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  const leaseToken = `lease_${Math.random().toString(36).substring(2, 12)}_${Date.now()}`;
  const claimResult = await claimZipImportLease(db, userId, importId, leaseToken);

  if (!claimResult.claimed) {
    console.info('[runTraktZipImport] Skipping duplicate or obsolete import task', {
      activeImportId: claimResult.activeImportId,
      importId,
      reason: claimResult.reason,
      userId,
    });
    if (claimResult.reason === 'obsolete_id') {
      try {
        const [exists] = await file.exists();
        if (exists) {
          await file.delete();
        }
      } catch (cleanupError) {
        console.warn(
          `[runTraktZipImport] Failed to clean up obsolete zip file at ${storagePath}:`,
          cleanupError
        );
      }
    }
    return;
  }

  let hasOwnership = true;

  try {
    const [metadata] = await file.getMetadata();
    const rawSize = metadata.size;
    const size = typeof rawSize === 'number' ? rawSize : parseInt(String(rawSize || '0'), 10);
    if (size > MAX_ZIP_SIZE_BYTES) {
      throw new Error(`Import archive size (${size} bytes) exceeds the 200MB maximum allowed limit.`);
    }

    const [downloadBuffer] = await file.download();

    // Phase 2: Parsing
    const parseTime = Timestamp.now();
    hasOwnership = await updateZipImportProgressWithLease(db, userId, importId, leaseToken, {
      percent: 35,
      phase: 'parsing',
      updatedAt: parseTime,
    });
    if (!hasOwnership) {
      console.warn('[runTraktZipImport] Lost lease ownership before parsing; aborting worker.', {
        importId,
        userId,
      });
      return;
    }

    const parsedData = parseTraktZipBuffer(downloadBuffer);

    // Phase 3: Syncing
    const syncTime = Timestamp.now();
    hasOwnership = await updateZipImportProgressWithLease(db, userId, importId, leaseToken, {
      percent: 65,
      phase: 'syncing',
      updatedAt: syncTime,
    });
    if (!hasOwnership) {
      console.warn('[runTraktZipImport] Lost lease ownership before syncing; aborting worker.', {
        importId,
        userId,
      });
      return;
    }

    // Persist and validate the token before syncTraktZipImport
    const stillOwner = await verifyZipImportLeaseOwnership(db, userId, importId, leaseToken);
    if (!stillOwner) {
      console.warn(
        '[runTraktZipImport] Lost lease ownership immediately before syncTraktZipImport; aborting without writes.',
        {
          importId,
          userId,
        }
      );
      return;
    }

    const syncResult = await syncTraktZipImport(userId, parsedData);

    // Phase 4: Completed
    const completedAt = Timestamp.now();
    const stats = {
      customLists: syncResult.customListsSynced,
      episodes: syncResult.episodesSynced,
      favorites: syncResult.favoritesSynced,
      movies: syncResult.moviesSynced,
      movieWatches: syncResult.movieWatchesSynced,
      ratings: syncResult.ratingsSynced,
      shows: syncResult.showsSynced,
      watchlist: syncResult.watchlistSynced,
    };

    hasOwnership = await completeZipImportWithLease(db, userId, importId, leaseToken, {
      completedAt,
      stats,
    });
    if (!hasOwnership) {
      console.warn(
        '[runTraktZipImport] Lost lease ownership before writing completion; skipping user doc update.',
        {
          importId,
          userId,
        }
      );
      return;
    }

    // Post-import enrichment in an isolated try/catch block so failure cannot overwrite status
    if (syncResult.listsToEnrich.length > 0) {
      try {
        const enrichmentRun = await prepareEnrichmentRun(userId, syncResult.listsToEnrich, false, {
          bypassCooldown: true,
        });
        if (enrichmentRun.kind === 'queued') {
          console.info('[runTraktZipImport] Auto-queued post-import enrichment', {
            includeEpisodes: enrichmentRun.status.includeEpisodes,
            listCount: enrichmentRun.status.lists.length,
            runId: enrichmentRun.status.runId,
            userId,
          });
          await dispatchEnrichmentRun(enrichmentRun.status);
        } else if (enrichmentRun.kind === 'merged') {
          console.info('[runTraktZipImport] Merged lists into active post-import enrichment run', {
            pendingListCount: enrichmentRun.pendingLists.length,
            runId: enrichmentRun.status.runId,
            userId,
          });
        }
      } catch (enrichError) {
        console.warn(
          `[runTraktZipImport] Failed to enqueue post-import enrichment for user ${userId}:`,
          enrichError
        );
      }
    }
  } catch (error) {
    console.error(`[runTraktZipImport] Error processing import ${importId} for user ${userId}:`, error);
    const friendlyMessage =
      error instanceof Error && error.message
        ? error.message
        : 'An error occurred while importing your Trakt archive.';

    const failedAt = Timestamp.now();
    await failZipImportWithLease(db, userId, importId, leaseToken, {
      error: friendlyMessage,
      failedAt,
    });
  } finally {
    // Phase 5: Storage cleanup in finally block
    try {
      const [exists] = await file.exists();
      if (exists) {
        await file.delete();
      }
    } catch (cleanupError) {
      console.warn(
        `[runTraktZipImport] Failed to clean up zip file at ${storagePath}:`,
        cleanupError
      );
    }
  }
};

export const startTraktZipImport = onCall(
  {
    maxInstances: 10,
    region: 'us-central1',
  },
  startTraktZipImportHandler
);

export const runTraktZipImport = onTaskDispatched<TraktZipImportTaskPayload>(
  {
    maxInstances: 3,
    memory: '1GiB',
    rateLimits: {
      maxConcurrentDispatches: 5,
      maxDispatchesPerSecond: 5,
    },
    region: TRAKT_ZIP_IMPORT_QUEUE_REGION,
    retryConfig: {
      maxAttempts: 1,
    },
    timeoutSeconds: 1800,
  },
  runTraktZipImportHandler
);
