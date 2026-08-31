import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import type { Request, Response as ExpressResponse } from 'express';
import {
  ACTIVE_RUN_STATUSES,
  CORS_ALLOWED_ORIGINS_ENV,
  CORS_ALLOW_HEADERS,
  CORS_ALLOW_METHODS,
  DEV_SYNC_BYPASS_HEADER,
  TMDB_API_KEY,
  TRAKT_CLIENT_ID,
  TRAKT_CLIENT_SECRET,
  TRAKT_ENRICHMENT_COOLDOWN_MS,
  TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
  TRAKT_ENRICHMENT_QUEUE_MAX_BACKOFF_SECONDS,
  TRAKT_ENRICHMENT_QUEUE_MIN_BACKOFF_SECONDS,
  TRAKT_OAUTH_START_COOLDOWN_MS,
  TRAKT_REDIRECT_URI,
  TRAKT_SYNC_BYPASS_UIDS_ENV,
  TRAKT_SYNC_COOLDOWN_MS,
  TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
  TRAKT_SYNC_QUEUE_MAX_BACKOFF_SECONDS,
  TRAKT_SYNC_QUEUE_MIN_BACKOFF_SECONDS,
  TRAKT_SYNC_QUEUE_REGION,
} from './constants';
import {
  buildEpisodeTrackingDoc,
} from './builders';
import {
  consumeOAuthState,
  createOAuthState,
  exchangeAuthorizationCode,
  getWatchedMovies,
  getWatchedShows,
  traktPaginatedRequest,
  traktRequestRaw,
} from './client';
import {
  buildEnrichmentResponseBody,
  dispatchEnrichmentRun,
  enrichEpisodeTracking,
  enqueueEnrichmentRun,
  getEnrichmentListStatuses,
  parseEnrichmentTaskPayload,
  parseTaskPayload,
  prepareEnrichmentRun,
  runTraktEnrichmentJob,
} from './enrichment';
import {
  buildRateLimitedEnrichmentResponse,
  buildRateLimitedSyncResponse,
  createFailureEnrichmentStatus,
  createFailureStatus,
  createQueuedSyncStatus,
  emptyEnrichmentCounts,
  emptyItemsSynced,
  getManualSyncCooldownTimestamp,
  getPreviousEnrichmentCompletedAt,
  getPreviousLastSyncedAt,
  getRateLimitedSyncCooldownTimestamp,
  getSyncResponseBody,
  getSyncSummaryMode,
  normalizeSyncError,
  sanitizeEnrichmentStatusForWrite,
  sanitizeSyncStatusForWrite,
  serializeSyncStatus,
  writeCompletedSyncResult,
  writeEnrichmentStatus,
  writeSyncStatus,
} from './status';
import {
  enqueueSyncRun,
  maybeRefreshAccessToken,
  reconcileCustomLists,
  reconcileManagedList,
  syncTraktImport,
} from './sync';
import {
  normalizeListIds,
  toFirestoreTimestamp,
  transformFavorite,
  transformRating,
} from './transforms';
import type {
  EnrichmentTaskPayload,
  ManualSyncCooldownBypassSource,
  OAuthJsonResponse,
  SyncResponseBody,
  SyncTaskPayload,
  TraktOAuthFailureReason,
  TraktUserDoc,
} from './types';
import {
  TraktOAuthError,
  TraktSyncError,
} from './types';

export const getAllowedCorsOrigin = (request: Request): string | undefined => {
  const origin = request.header('origin')?.trim();
  if (!origin) {
    return undefined;
  }

  const allowedOrigins = (process.env[CORS_ALLOWED_ORIGINS_ENV] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  return allowedOrigins.includes(origin) ? origin : undefined;
};

export const applyCorsHeaders = (request: Request, response: ExpressResponse): void => {
  const allowedOrigin = getAllowedCorsOrigin(request);
  response.setHeader('Vary', 'Origin');
  if (allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  response.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  response.setHeader('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
};

export const isFunctionsEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

export const hasDevSyncBypassHeader = (request: Request): boolean =>
  request.header(DEV_SYNC_BYPASS_HEADER) === 'true';

export const getAllowedSyncBypassUids = (): Set<string> =>
  new Set(
    (process.env[TRAKT_SYNC_BYPASS_UIDS_ENV] ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  );

export const getManualSyncCooldownBypassSource = (
  request: Request,
  userId: string
): ManualSyncCooldownBypassSource | undefined => {
  if (!hasDevSyncBypassHeader(request)) {
    return undefined;
  }

  if (isFunctionsEmulator()) {
    return 'emulator';
  }

  return getAllowedSyncBypassUids().has(userId) ? 'allowlist' : undefined;
};

export const sendCorsPreflight = (request: Request, response: ExpressResponse): void => {
  applyCorsHeaders(request, response);
  response.status(204).send('');
};

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const renderSuccessHtml = (): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Trakt Connected</title>
  </head>
  <body style="margin:0;background:#0d0d0d;color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;">
      <section style="max-width:360px;">
        <div style="width:80px;height:80px;border-radius:999px;background:#22c55e;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h1 style="font-size:28px;margin:0 0 12px;">Successfully Connected</h1>
        <p style="font-size:16px;line-height:1.6;color:#a1a1aa;margin:0;">
          Your Trakt account has been linked. You can close this page and return to the app.
        </p>
      </section>
    </main>
  </body>
</html>`;

export const getErrorCopy = (reason: TraktOAuthFailureReason): { description: string; title: string } => {
  switch (reason) {
    case 'rate_limited':
      return {
        title: 'Too Many Trakt Requests',
        description: 'Please wait a minute before trying to connect Trakt again.',
      };
    case 'upstream_blocked':
      return {
        title: 'Connection Temporarily Blocked',
        description:
          "Trakt's upstream security blocked this token exchange request. Please try again shortly from the app.",
      };
    case 'upstream_unavailable':
      return {
        title: 'Trakt Is Temporarily Unavailable',
        description:
          'Trakt could not be reached from the backend right now. Please try connecting again in a few minutes.',
      };
    case 'invalid_oauth':
    default:
      return {
        title: 'Authorization Could Not Be Verified',
        description: 'The authorization callback could not be validated. Start the Trakt connection flow again from the app.',
      };
  }
};

export const renderErrorHtml = (
  reason: TraktOAuthFailureReason,
  errorMessage: string,
  rayId?: string
): string => {
  const copy = getErrorCopy(reason);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.title)}</title>
  </head>
  <body style="margin:0;background:#0d0d0d;color:#ffffff;font-family:system-ui,-apple-system,sans-serif;">
    <main style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center;">
      <section style="max-width:420px;">
        <div style="width:80px;height:80px;border-radius:999px;background:#ef4444;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
        <h1 style="font-size:28px;margin:0 0 12px;">${escapeHtml(copy.title)}</h1>
        <p style="font-size:16px;line-height:1.6;color:#a1a1aa;margin:0 0 16px;">
          ${escapeHtml(copy.description)}
        </p>
        <div style="text-align:left;border:1px solid #27272a;border-radius:8px;padding:12px 16px;background:#111111;color:#d4d4d8;font-size:14px;line-height:1.6;">
          <div><strong>Error:</strong> ${escapeHtml(errorMessage || 'unknown')}</div>
          <div><strong>Reason:</strong> ${escapeHtml(reason)}</div>
          ${rayId ? `<div><strong>Ray ID:</strong> ${escapeHtml(rayId)}</div>` : ''}
        </div>
      </section>
    </main>
  </body>
</html>`;
};

export const extractBearerToken = (request: Request): string | null => {
  const authorization = request.header('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

export const verifyUser = async (request: Request): Promise<admin.auth.DecodedIdToken> => {
  const token = extractBearerToken(request);
  if (!token) {
    throw new TraktSyncError('Authentication required.', 'auth_invalid', false);
  }

  try {
    return await admin.auth().verifyIdToken(token);
  } catch (error) {
    console.error('[Trakt] Failed to verify Firebase ID token:', error);
    throw new TraktSyncError('Authentication required.', 'auth_invalid', false);
  }
};

export const sendJsonError = (
  request: Request,
  response: ExpressResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void => {
  applyCorsHeaders(request, response);
  response.status(statusCode).json(payload);
};

export const sendMethodNotAllowed = (request: Request, response: ExpressResponse): void => {
  sendJsonError(request, response, 405, { error: 'Method Not Allowed' });
};

export const sendNotFound = (request: Request, response: ExpressResponse): void => {
  sendJsonError(request, response, 404, { error: 'Not Found' });
};

export const parseBody = <T extends Record<string, unknown>>(request: Request): T =>
  ((request.body ?? {}) as T);

export const normalizePath = (request: Request): string => {
  const path = (request.path || '/').replace(/\/+$/, '');
  return path || '/';
};

export const handleOAuthStart = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const result = await createOAuthState(decodedToken.uid);
    applyCorsHeaders(request, response);
    response.status(200).json({ authUrl: result.authUrl } satisfies OAuthJsonResponse);
  } catch (error) {
    if (error instanceof TraktOAuthError && error.reason === 'rate_limited') {
      applyCorsHeaders(request, response);
      response.status(429).json({
        error: error.message,
        nextAllowedAt: new Date(Date.now() + TRAKT_OAUTH_START_COOLDOWN_MS).toISOString(),
      } satisfies OAuthJsonResponse);
      return;
    }

    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const handleSyncPost = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const userId = decodedToken.uid;
    const cooldownBypassSource = getManualSyncCooldownBypassSource(request, userId);
    const bypassManualCooldown = cooldownBypassSource !== undefined;
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const runRef = userRef.collection('traktSyncRuns').doc();

    const transactionResult = await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;

      if (!userData.traktConnected || !userData.traktAccessToken) {
        throw new TraktSyncError('Trakt not connected for this user.', 'auth_invalid', false);
      }

      const existingStatus = userData.traktSyncStatus;
      if (existingStatus?.status && ACTIVE_RUN_STATUSES.has(existingStatus.status)) {
        return {
          kind: 'active' as const,
          status: existingStatus,
          userData,
        };
      }

      const nextAllowedSyncAt = getManualSyncCooldownTimestamp(existingStatus);
      if (nextAllowedSyncAt instanceof Timestamp && nextAllowedSyncAt.toMillis() > Date.now()) {
        const shouldEnforceCooldown =
          (existingStatus?.status === 'failed' && existingStatus.errorCategory === 'rate_limited') ||
          (existingStatus?.status === 'completed' && !bypassManualCooldown);

        if (shouldEnforceCooldown) {
          return {
            kind: 'rate_limited' as const,
            nextAllowedSyncAt,
            userData,
          };
        }
      }

      const queuedStatus = createQueuedSyncStatus(
        userId,
        runRef.id,
        getSyncSummaryMode(userData.traktIncrementalState),
        getPreviousLastSyncedAt(existingStatus)
      );
      const queuedStatusForWrite = sanitizeSyncStatusForWrite(queuedStatus);
      transaction.set(runRef, queuedStatusForWrite);
      transaction.set(
        userRef,
        {
          traktSyncStatus: queuedStatusForWrite,
        },
        { mergeFields: ['traktSyncStatus'] }
      );

      return {
        kind: 'queued' as const,
        bypassedCompletedCooldown:
          nextAllowedSyncAt instanceof Timestamp &&
          nextAllowedSyncAt.toMillis() > Date.now() &&
          existingStatus?.status === 'completed' &&
          cooldownBypassSource,
        status: queuedStatus,
      };
    });

    if (transactionResult.kind === 'active') {
      applyCorsHeaders(request, response);
      response.status(202).json({
        connected: true,
        synced: Boolean(transactionResult.status?.lastSyncedAt),
        ...serializeSyncStatus(transactionResult.status),
      } satisfies SyncResponseBody);
      return;
    }

    if (transactionResult.kind === 'rate_limited') {
      applyCorsHeaders(request, response);
      response.status(429).json(
        buildRateLimitedSyncResponse(
          transactionResult.userData,
          transactionResult.nextAllowedSyncAt,
          'Please wait before starting another Trakt sync.'
        )
      );
      return;
    }

    if (transactionResult.bypassedCompletedCooldown === 'allowlist') {
      console.info('[Trakt] Bypassed manual sync cooldown for allowlisted tester', {
        runId: transactionResult.status.runId,
        userId,
      });
    }

    const runId = transactionResult.status.runId;
    try {
      await enqueueSyncRun(
        {
          runId,
          userId,
        },
        { taskId: runId }
      );
    } catch (error) {
      console.error('[Trakt] Failed to enqueue sync task:', error);

      const failedStatus = createFailureStatus(
        userId,
        runId,
        transactionResult.status.summaryMode ?? getSyncSummaryMode(undefined),
        getPreviousLastSyncedAt(transactionResult.status),
        emptyItemsSynced(),
        0,
        'failed',
        new TraktSyncError('Failed to enqueue Trakt sync.', 'internal', false),
        undefined,
        transactionResult.status.nextAllowedSyncAt
      );
      await writeSyncStatus(userId, runId, failedStatus);

      sendJsonError(request, response, 500, {
        connected: true,
        synced: Boolean(failedStatus.lastSyncedAt),
        ...serializeSyncStatus(failedStatus),
        error: failedStatus.errorMessage,
      });
      return;
    }

    applyCorsHeaders(request, response);
    response.status(202).json({
      connected: true,
      synced: Boolean(transactionResult.status.lastSyncedAt),
      ...serializeSyncStatus(transactionResult.status),
    } satisfies SyncResponseBody);
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const handleSyncGet = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const userSnapshot = await admin.firestore().collection('users').doc(decodedToken.uid).get();
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;

    applyCorsHeaders(request, response);
    response.status(200).json(getSyncResponseBody(userData));
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const handleDisconnect = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    await admin.firestore().collection('users').doc(decodedToken.uid).set(
      {
        traktAccessToken: FieldValue.delete(),
        traktConnected: false,
        traktConnectedAt: FieldValue.delete(),
        traktOauthStartAllowedAt: FieldValue.delete(),
        traktIncrementalState: FieldValue.delete(),
        traktRefreshToken: FieldValue.delete(),
        traktEnrichmentStatus: FieldValue.delete(),
        traktSyncStatus: FieldValue.delete(),
        traktTokenExpiresAt: FieldValue.delete(),
      },
      { merge: true }
    );

    applyCorsHeaders(request, response);
    response.status(200).json({ success: true });
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const handleEnrichPost = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const userId = decodedToken.uid;
    const body = parseBody<{ includeEpisodes?: unknown; lists?: unknown }>(request);
    const includeEpisodes = body.includeEpisodes !== false;
    const requestedLists =
      Array.isArray(body.lists) && body.lists.every((listId) => typeof listId === 'string')
        ? (body.lists as string[])
        : undefined;

    const transactionResult = await prepareEnrichmentRun(userId, requestedLists, includeEpisodes);

    if (transactionResult.kind === 'active' || transactionResult.kind === 'merged') {
      applyCorsHeaders(request, response);
      response.status(202).json(await buildEnrichmentResponseBody(userId, transactionResult.userData));
      return;
    }

    if (transactionResult.kind === 'rate_limited') {
      applyCorsHeaders(request, response);
      response.status(429).json(
        buildRateLimitedEnrichmentResponse(
          transactionResult.userData,
          transactionResult.nextAllowedEnrichAt,
          await getEnrichmentListStatuses(userId),
          'Please wait before running TMDB enrichment again.'
        )
      );
      return;
    }

    try {
      await dispatchEnrichmentRun(transactionResult.status);
    } catch {
      const failedResponse = await buildEnrichmentResponseBody(userId);
      sendJsonError(request, response, 500, {
        ...failedResponse,
        error: failedResponse.errorMessage || 'Failed to enqueue TMDB enrichment.',
      });
      return;
    }

    applyCorsHeaders(request, response);
    response.status(202).json(
      await buildEnrichmentResponseBody(userId, {
        traktEnrichmentStatus: transactionResult.status,
      })
    );
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const handleEnrichGet = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'GET') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const userId = decodedToken.uid;
    applyCorsHeaders(request, response);
    response.status(200).json(await buildEnrichmentResponseBody(userId));
  } catch (error) {
    const normalizedError = normalizeSyncError(error);
    const statusCode = normalizedError.category === 'auth_invalid' ? 401 : 500;
    sendJsonError(request, response, statusCode, {
      error: normalizedError.message,
      errorCategory: normalizedError.category,
    });
  }
};

export const traktApi = onRequest(
  {
    maxInstances: 10,
    region: TRAKT_SYNC_QUEUE_REGION,
    secrets: [TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TRAKT_REDIRECT_URI, TMDB_API_KEY],
    timeoutSeconds: 300,
  },
  async (request, response): Promise<void> => {
    if (request.method === 'OPTIONS') {
      sendCorsPreflight(request, response);
      return;
    }

    const path = normalizePath(request);
    switch (`${request.method.toUpperCase()} ${path}`) {
      case 'POST /oauth/start':
        await handleOAuthStart(request, response);
        return;
      case 'POST /sync':
        await handleSyncPost(request, response);
        return;
      case 'GET /sync':
        await handleSyncGet(request, response);
        return;
      case 'POST /disconnect':
        await handleDisconnect(request, response);
        return;
      case 'POST /enrich':
        await handleEnrichPost(request, response);
        return;
      case 'GET /enrich':
        await handleEnrichGet(request, response);
        return;
      default:
        sendNotFound(request, response);
    }
  }
);

export const traktCallback = onRequest(
  {
    maxInstances: 5,
    region: TRAKT_SYNC_QUEUE_REGION,
    secrets: [TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TRAKT_REDIRECT_URI],
    timeoutSeconds: 120,
  },
  async (request, response): Promise<void> => {
    if (request.method !== 'GET') {
      response.status(405).send('Method Not Allowed');
      return;
    }

    const code = typeof request.query.code === 'string' ? request.query.code.trim() : '';
    const state = typeof request.query.state === 'string' ? request.query.state.trim() : '';
    const traktError = typeof request.query.error === 'string' ? request.query.error.trim() : '';

    if (traktError) {
      response.status(400).type('html').send(renderErrorHtml('invalid_oauth', traktError));
      return;
    }

    if (!code || !state) {
      response.status(400).type('html').send(renderErrorHtml('invalid_oauth', 'missing_code_or_state'));
      return;
    }

    try {
      const userId = await consumeOAuthState(state);
      const tokenData = await exchangeAuthorizationCode(code);
      const expiresAt = Timestamp.fromMillis((tokenData.created_at + tokenData.expires_in) * 1000);

      await admin.firestore().collection('users').doc(userId).set(
        {
          traktAccessToken: tokenData.access_token,
          traktConnected: true,
          traktConnectedAt: Timestamp.now(),
          traktEnrichmentStatus: FieldValue.delete(),
          traktIncrementalState: FieldValue.delete(),
          traktRefreshToken: tokenData.refresh_token,
          traktSyncStatus: FieldValue.delete(),
          traktTokenExpiresAt: expiresAt,
        },
        { merge: true }
      );

      response.status(200).type('html').send(renderSuccessHtml());
    } catch (error) {
      if (error instanceof TraktOAuthError) {
        const statusCode = error.reason === 'upstream_unavailable' ? 503 : error.reason === 'rate_limited' ? 429 : 400;
        response
          .status(statusCode)
          .type('html')
          .send(renderErrorHtml(error.reason, error.message, error.cfRay));
        return;
      }

      console.error('[Trakt] OAuth callback failed:', error);
      response.status(500).type('html').send(renderErrorHtml('upstream_unavailable', 'token_exchange_failed'));
    }
  }
);

export const runTraktSync = onTaskDispatched<SyncTaskPayload>(
  {
    maxInstances: 3,
    memory: '1GiB',
    rateLimits: {
      maxConcurrentDispatches: 5,
      maxDispatchesPerSecond: 5,
    },
    region: TRAKT_SYNC_QUEUE_REGION,
    retryConfig: {
      maxAttempts: TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
      maxBackoffSeconds: TRAKT_SYNC_QUEUE_MAX_BACKOFF_SECONDS,
      maxDoublings: 4,
      minBackoffSeconds: TRAKT_SYNC_QUEUE_MIN_BACKOFF_SECONDS,
    },
    secrets: [TRAKT_CLIENT_ID, TRAKT_CLIENT_SECRET, TRAKT_REDIRECT_URI],
    timeoutSeconds: 1800,
  },
  async (request): Promise<void> => {
    const { runId, userId } = parseTaskPayload(request.data);
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return;
    }

    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentSyncStatus = userData.traktSyncStatus;
    const currentAttempt = typeof currentSyncStatus?.attempt === 'number' ? currentSyncStatus.attempt : 0;
    const attempt = Math.max(currentAttempt, request.retryCount) + 1;
    const previousLastSyncedAt = getPreviousLastSyncedAt(currentSyncStatus);
    const summaryMode = currentSyncStatus?.summaryMode ?? getSyncSummaryMode(userData.traktIncrementalState);

    if (!userData.traktConnected) {
      await writeSyncStatus(
        userId,
        runId,
        createFailureStatus(
          userId,
          runId,
          summaryMode,
          previousLastSyncedAt,
          emptyItemsSynced(),
          attempt,
          'failed',
          new TraktSyncError('Trakt is not connected for this user.', 'auth_invalid', false)
        )
      );
      return;
    }

    if (currentSyncStatus?.runId && currentSyncStatus.runId !== runId) {
      console.info('[TraktSync] Skipping stale run', {
        activeRunId: currentSyncStatus.runId,
        runId,
        userId,
      });
      return;
    }

    const startedAt = Timestamp.now();
    await writeSyncStatus(userId, runId, {
      attempt,
      itemsSynced: emptyItemsSynced(),
      lastSyncedAt: previousLastSyncedAt,
      maxAttempts: TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
      runId,
      startedAt,
      status: 'in_progress',
      summaryMode,
      updatedAt: startedAt,
      userId,
    });

    try {
      const accessToken = await maybeRefreshAccessToken(userId, userData);
      const syncResult = await syncTraktImport(userId, accessToken, userData.traktIncrementalState);
      const { itemsSynced, listsToEnrich, nextIncrementalState, summaryMode: completedSummaryMode } =
        syncResult;

      console.info('[TraktSync] Completed sync import', {
        itemsSynced,
        listsToEnrich,
        runId,
        userId,
      });

      if (listsToEnrich.length > 0) {
        try {
          const enrichmentRun = await prepareEnrichmentRun(userId, listsToEnrich, false);
          if (enrichmentRun.kind === 'queued') {
            console.info('[TraktSync] Auto-queued post-sync enrichment', {
              includeEpisodes: enrichmentRun.status.includeEpisodes,
              listCount: enrichmentRun.status.lists.length,
              runId: enrichmentRun.status.runId,
              userId,
            });
            await dispatchEnrichmentRun(enrichmentRun.status);
          }
        } catch (enrichmentError) {
          console.error('[TraktEnrichment] Failed to auto-start enrichment after sync:', enrichmentError);
        }
      }

      const completedAt = Timestamp.now();
      const nextAllowedSyncAt = Timestamp.fromMillis(completedAt.toMillis() + TRAKT_SYNC_COOLDOWN_MS);

      await writeCompletedSyncResult(userId, runId, {
        attempt,
        completedAt,
        itemsSynced,
        lastSyncedAt: completedAt,
        maxAttempts: TRAKT_SYNC_QUEUE_MAX_ATTEMPTS,
        nextAllowedSyncAt,
        runId,
        startedAt,
        status: 'completed',
        summaryMode: completedSummaryMode,
        updatedAt: completedAt,
        userId,
      }, nextIncrementalState);
    } catch (error) {
      const normalizedError = normalizeSyncError(error);
      console.error('[TraktSync] Sync attempt failed', {
        attempt,
        category: normalizedError.category,
        endpoint: normalizedError.endpoint,
        retryable: normalizedError.retryable,
        runId,
        statusCode: normalizedError.statusCode,
        userId,
      });

      if (normalizedError.retryable && attempt < TRAKT_SYNC_QUEUE_MAX_ATTEMPTS) {
        await writeSyncStatus(
          userId,
          runId,
          createFailureStatus(
            userId,
            runId,
            summaryMode,
            previousLastSyncedAt,
            emptyItemsSynced(),
            attempt,
            'retrying',
            normalizedError,
            request.retryReason
          )
        );

        if (normalizedError.retryAfterSeconds !== undefined) {
          try {
            await enqueueSyncRun(
              {
                runId,
                userId,
              },
              { scheduleDelaySeconds: normalizedError.retryAfterSeconds }
            );
            return;
          } catch (enqueueError) {
            console.error('[TraktSync] Failed to enqueue delayed retry task:', {
              delaySeconds: normalizedError.retryAfterSeconds,
              enqueueError,
              runId,
              userId,
            });
          }
        }

        throw normalizedError;
      }

      const nextAllowedSyncAt = getRateLimitedSyncCooldownTimestamp(normalizedError);

      await writeSyncStatus(
        userId,
        runId,
        createFailureStatus(
          userId,
          runId,
          summaryMode,
          previousLastSyncedAt,
          emptyItemsSynced(),
          attempt,
          'failed',
          normalizedError,
          request.retryReason,
          nextAllowedSyncAt
        )
      );
    }
  }
);

export const runTraktEnrichment = onTaskDispatched<EnrichmentTaskPayload>(
  {
    maxInstances: 2,
    memory: '1GiB',
    rateLimits: {
      maxConcurrentDispatches: 2,
      maxDispatchesPerSecond: 2,
    },
    region: TRAKT_SYNC_QUEUE_REGION,
    retryConfig: {
      maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
      maxBackoffSeconds: TRAKT_ENRICHMENT_QUEUE_MAX_BACKOFF_SECONDS,
      maxDoublings: 4,
      minBackoffSeconds: TRAKT_ENRICHMENT_QUEUE_MIN_BACKOFF_SECONDS,
    },
    secrets: [TMDB_API_KEY],
    timeoutSeconds: 1800,
  },
  async (request): Promise<void> => {
    const { includeEpisodes, lists, runId, userId } = parseEnrichmentTaskPayload(request.data);
    const db = admin.firestore();
    const userRef = db.collection('users').doc(userId);
    const userSnapshot = await userRef.get();

    if (!userSnapshot.exists) {
      return;
    }

    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentStatus = userData.traktEnrichmentStatus;
    const currentAttempt = typeof currentStatus?.attempt === 'number' ? currentStatus.attempt : 0;
    const attempt = Math.max(currentAttempt, request.retryCount) + 1;
    const previousCompletedAt = getPreviousEnrichmentCompletedAt(currentStatus);
    const nextAllowedEnrichAt =
      currentStatus?.nextAllowedEnrichAt instanceof Timestamp
        ? currentStatus.nextAllowedEnrichAt
        : Timestamp.fromMillis(Date.now() + TRAKT_ENRICHMENT_COOLDOWN_MS);

    if (currentStatus?.runId && currentStatus.runId !== runId) {
      console.info('[TraktEnrichment] Skipping stale run', {
        activeRunId: currentStatus.runId,
        runId,
        userId,
      });
      return;
    }

    const startedAt = Timestamp.now();
    await writeEnrichmentStatus(userId, runId, {
      attempt,
      completedAt: previousCompletedAt,
      counts: emptyEnrichmentCounts(),
      includeEpisodes,
      lists,
      maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
      nextAllowedEnrichAt,
      runId,
      startedAt,
      status: 'in_progress',
      updatedAt: startedAt,
      userId,
    });

    try {
      console.info('[TraktEnrichment] Starting queued enrichment run', {
        includeEpisodes,
        listCount: lists.length,
        runId,
        userId,
      });

      let currentListsToEnrich = lists;
      const accumulatedCounts = emptyEnrichmentCounts();
      let pass = 0;
      const MAX_DRAIN_PASSES = 10;
      const MAX_EXECUTION_TIME_MS = 25 * 60 * 1000;
      const runStartTime = Date.now();
      const allEnrichedLists: string[] = [];

      while (currentListsToEnrich.length > 0 && pass < MAX_DRAIN_PASSES) {
        pass += 1;
        allEnrichedLists.push(...currentListsToEnrich);
        const passCounts = await runTraktEnrichmentJob(
          userId,
          currentListsToEnrich,
          includeEpisodes && pass === 1,
          runId
        );
        accumulatedCounts.episodes += passCounts.episodes;
        accumulatedCounts.items += passCounts.items;
        accumulatedCounts.lists += passCounts.lists;

        if (Date.now() - runStartTime > MAX_EXECUTION_TIME_MS) {
          console.warn('[TraktEnrichment] Approaching execution timeout during drain loop', {
            pass,
            runId,
            userId,
          });
          break;
        }

        // Transactionally check and drain pendingLists from the user doc
        currentListsToEnrich = await db.runTransaction(async (transaction) => {
          const freshUserDoc = await transaction.get(userRef);
          const freshUserData = (freshUserDoc.data() ?? {}) as TraktUserDoc;
          const freshStatus = freshUserData.traktEnrichmentStatus;

          if (freshStatus?.runId !== runId) {
            return [];
          }

          const pendingLists = freshStatus?.pendingLists;
          if (!Array.isArray(pendingLists) || pendingLists.length === 0) {
            return [];
          }

          transaction.set(
            userRef,
            {
              traktEnrichmentStatus: {
                ...freshStatus,
                pendingLists: [],
                updatedAt: Timestamp.now(),
              },
            },
            { merge: true }
          );

          return normalizeListIds(pendingLists);
        });

        if (currentListsToEnrich.length > 0) {
          console.info('[TraktEnrichment] Draining pending lists in active enrichment run', {
            drainedListCount: currentListsToEnrich.length,
            pass,
            runId,
            userId,
          });
        }
      }

      const completedAt = Timestamp.now();

      await writeEnrichmentStatus(userId, runId, {
        attempt,
        completedAt,
        counts: accumulatedCounts,
        includeEpisodes,
        lists: normalizeListIds(allEnrichedLists),
        maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
        nextAllowedEnrichAt,
        pendingLists: [],
        runId,
        startedAt,
        status: 'completed',
        updatedAt: completedAt,
        userId,
      });
    } catch (error) {
      const normalizedError = normalizeSyncError(error);
      console.error('[TraktEnrichment] Enrichment attempt failed', {
        attempt,
        category: normalizedError.category,
        endpoint: normalizedError.endpoint,
        retryable: normalizedError.retryable,
        runId,
        statusCode: normalizedError.statusCode,
        userId,
      });

      if (normalizedError.retryable && attempt < TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS) {
        await writeEnrichmentStatus(
          userId,
          runId,
          createFailureEnrichmentStatus(
            userId,
            runId,
            lists,
            includeEpisodes,
            previousCompletedAt,
            emptyEnrichmentCounts(),
            attempt,
            'retrying',
            normalizedError,
            request.retryReason,
            nextAllowedEnrichAt
          )
        );

        if (normalizedError.retryAfterSeconds !== undefined) {
          try {
            await enqueueEnrichmentRun(
              {
                includeEpisodes,
                lists,
                runId,
                userId,
              },
              { scheduleDelaySeconds: normalizedError.retryAfterSeconds }
            );
            return;
          } catch (enqueueError) {
            console.error('[TraktEnrichment] Failed to enqueue delayed retry task:', {
              delaySeconds: normalizedError.retryAfterSeconds,
              enqueueError,
              runId,
              userId,
            });
          }
        }

        throw normalizedError;
      }

      await writeEnrichmentStatus(
        userId,
        runId,
        createFailureEnrichmentStatus(
          userId,
          runId,
          lists,
          includeEpisodes,
          previousCompletedAt,
          emptyEnrichmentCounts(),
          attempt,
          'failed',
          normalizedError,
          request.retryReason,
          nextAllowedEnrichAt
        )
      );
    }
  }
);

export const __test__ = {
  buildEpisodeTrackingDoc,
  enrichEpisodeTracking,
  getAllowedCorsOrigin,
  getWatchedMovies,
  getWatchedShows,
  reconcileCustomLists,
  reconcileManagedList,
  sanitizeEnrichmentStatusForWrite,
  sanitizeSyncStatusForWrite,
  syncTraktImport,
  toFirestoreTimestamp,
  traktPaginatedRequest,
  traktRequestRaw,
  transformFavorite,
  transformRating,
};
