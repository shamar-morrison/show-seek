import * as admin from 'firebase-admin';
import { Timestamp } from 'firebase-admin/firestore';
import { getFunctions } from 'firebase-admin/functions';
import { type CallableRequest, HttpsError, onCall } from 'firebase-functions/v2/https';
import { onTaskDispatched, type Request as TaskRequest } from 'firebase-functions/v2/tasks';
import {
  buildTraktZipImportDocPath,
  buildTraktZipImportStoragePath,
  TRAKT_ZIP_IMPORT_QUEUE_DEADLINE_SECONDS,
  TRAKT_ZIP_IMPORT_QUEUE_FUNCTION,
  TRAKT_ZIP_IMPORT_QUEUE_REGION,
} from './constants';
import { enqueueEnrichmentRun } from './enrichment';
import type {
  StartTraktZipImportRequest,
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

  const db = admin.firestore();
  await assertPremiumUser(db, userId);

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

  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));
  const now = Timestamp.now();

  await progressDocRef.set({
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

  await getFunctions()
    .taskQueue<TraktZipImportTaskPayload>(TRAKT_ZIP_IMPORT_QUEUE_FUNCTION)
    .enqueue(
      { importId, userId },
      {
        dispatchDeadlineSeconds: TRAKT_ZIP_IMPORT_QUEUE_DEADLINE_SECONDS,
        id: `zip_import_${importId}`,
      }
    );

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
  const progressDocRef = db.doc(buildTraktZipImportDocPath(userId, importId));
  const storagePath = buildTraktZipImportStoragePath(userId, importId);
  const bucket = admin.storage().bucket();
  const file = bucket.file(storagePath);

  try {
    // Phase 1: Downloading
    await progressDocRef.set(
      {
        progress: { current: 10, phase: 'downloading', total: 100 },
        status: 'processing',
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    const [metadata] = await file.getMetadata();
    const rawSize = metadata.size;
    const size = typeof rawSize === 'number' ? rawSize : parseInt(String(rawSize || '0'), 10);
    const MAX_ZIP_SIZE_BYTES = 200 * 1024 * 1024;
    if (size > MAX_ZIP_SIZE_BYTES) {
      throw new Error(`Import archive size (${size} bytes) exceeds the 200MB maximum allowed limit.`);
    }

    const [downloadBuffer] = await file.download();

    // Phase 2: Parsing
    await progressDocRef.set(
      {
        progress: { current: 35, phase: 'parsing', total: 100 },
        status: 'processing',
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    const parsedData = parseTraktZipBuffer(downloadBuffer);

    // Phase 3: Syncing
    await progressDocRef.set(
      {
        progress: { current: 65, phase: 'syncing', total: 100 },
        status: 'processing',
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );

    const syncResult = await syncTraktZipImport(userId, parsedData);

    // Phase 4: Completed
    const completedAt = Timestamp.now();
    await progressDocRef.set(
      {
        completedAt,
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: {
          customLists: syncResult.customListsSynced,
          episodes: syncResult.episodesSynced,
          favorites: syncResult.favoritesSynced,
          movies: syncResult.moviesSynced,
          movieWatches: syncResult.movieWatchesSynced,
          ratings: syncResult.ratingsSynced,
          shows: syncResult.showsSynced,
          watchlist: syncResult.watchlistSynced,
        },
        status: 'completed',
        updatedAt: completedAt,
      },
      { merge: true }
    );

    // Post-import enrichment in an isolated try/catch block so failure cannot overwrite status
    if (syncResult.listsToEnrich.length > 0) {
      try {
        await enqueueEnrichmentRun({
          includeEpisodes: false,
          lists: syncResult.listsToEnrich,
          runId: `enrich_zip_${importId}`,
          userId,
        });
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

    await progressDocRef.set(
      {
        error: friendlyMessage,
        failedAt: Timestamp.now(),
        progress: {
          phase: 'failed',
        },
        status: 'failed',
        updatedAt: Timestamp.now(),
      },
      { merge: true }
    );
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
