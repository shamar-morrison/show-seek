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

    const activeZip = userData.traktZipImportStatus?.status;
    if (activeZip === 'pending' || activeZip === 'processing') {
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
    await Promise.all([
      progressDocRef.set(
        {
          error: 'Failed to enqueue background processing task.',
          failedAt: failureNow,
          status: 'failed',
          updatedAt: failureNow,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            error: 'Failed to enqueue background processing task.',
            failedAt: failureNow,
            id: importId,
            phase: 'failed',
            status: 'failed',
            updatedAt: failureNow,
          },
        },
        { merge: true }
      ),
    ]).catch((cleanupError) => {
      console.error('[startTraktZipImport] Error during failure cleanup:', cleanupError);
    });

    if (enqueueError instanceof HttpsError) {
      throw enqueueError;
    }
    throw new HttpsError('internal', 'Failed to start background import task. Please try again.');
  }

  return { importId };
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
  const userDocRef = db.collection('users').doc(userId);
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));
  const storagePath = buildTraktZipImportStoragePath(userId, importId);
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  try {
    // Phase 1: Downloading
    const downloadTime = Timestamp.now();
    await Promise.all([
      progressDocRef.set(
        {
          progress: { current: 10, phase: 'downloading', total: 100 },
          status: 'processing',
          updatedAt: downloadTime,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            id: importId,
            phase: 'downloading',
            status: 'processing',
            updatedAt: downloadTime,
          },
        },
        { merge: true }
      ),
    ]);

    const [metadata] = await file.getMetadata();
    const rawSize = metadata.size;
    const size = typeof rawSize === 'number' ? rawSize : parseInt(String(rawSize || '0'), 10);
    if (size > MAX_ZIP_SIZE_BYTES) {
      throw new Error(`Import archive size (${size} bytes) exceeds the 200MB maximum allowed limit.`);
    }

    const [downloadBuffer] = await file.download();

    // Phase 2: Parsing
    const parseTime = Timestamp.now();
    await Promise.all([
      progressDocRef.set(
        {
          progress: { current: 35, phase: 'parsing', total: 100 },
          status: 'processing',
          updatedAt: parseTime,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            id: importId,
            phase: 'parsing',
            status: 'processing',
            updatedAt: parseTime,
          },
        },
        { merge: true }
      ),
    ]);

    const parsedData = parseTraktZipBuffer(downloadBuffer);

    // Phase 3: Syncing
    const syncTime = Timestamp.now();
    await Promise.all([
      progressDocRef.set(
        {
          progress: { current: 65, phase: 'syncing', total: 100 },
          status: 'processing',
          updatedAt: syncTime,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            id: importId,
            phase: 'syncing',
            status: 'processing',
            updatedAt: syncTime,
          },
        },
        { merge: true }
      ),
    ]);

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

    await Promise.all([
      progressDocRef.set(
        {
          completedAt,
          progress: { current: 100, phase: 'completed', total: 100 },
          stats,
          status: 'completed',
          updatedAt: completedAt,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            completedAt,
            id: importId,
            phase: 'completed',
            stats,
            status: 'completed',
            updatedAt: completedAt,
          },
        },
        { merge: true }
      ),
    ]);

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
    await Promise.all([
      progressDocRef.set(
        {
          error: friendlyMessage,
          failedAt,
          progress: {
            phase: 'failed',
          },
          status: 'failed',
          updatedAt: failedAt,
        },
        { merge: true }
      ),
      userDocRef.set(
        {
          traktZipImportStatus: {
            error: friendlyMessage,
            failedAt,
            id: importId,
            phase: 'failed',
            status: 'failed',
            updatedAt: failedAt,
          },
        },
        { merge: true }
      ),
    ]);
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
