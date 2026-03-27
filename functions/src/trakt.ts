import * as crypto from 'node:crypto';

import * as admin from 'firebase-admin';
import { getFunctions } from 'firebase-admin/functions';
import type { TaskOptions } from 'firebase-admin/functions';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';
import { onTaskDispatched } from 'firebase-functions/v2/tasks';
import type { Request, Response as ExpressResponse } from 'express';
import { buildListItemKey, getLegacyListItemKey } from './shared/listItemKeys';

const TRAKT_CLIENT_ID = defineSecret('TRAKT_CLIENT_ID');
const TRAKT_CLIENT_SECRET = defineSecret('TRAKT_CLIENT_SECRET');
const TRAKT_REDIRECT_URI = defineSecret('TRAKT_REDIRECT_URI');
const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

const TRAKT_API_BASE = 'https://api.trakt.tv';
const TRAKT_API_VERSION = '2';
const TRAKT_APP_USER_AGENT = 'ShowSeek-TraktFunctions/1.0';
const TMDB_API_BASE = 'https://api.themoviedb.org/3';
const TRAKT_REQUEST_TIMEOUT_MS = 20_000;
const TRAKT_OAUTH_TIMEOUT_MS = 15_000;
const TRAKT_TOKEN_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;
const TRAKT_SYNC_QUEUE_MAX_ATTEMPTS = 5;
const TRAKT_SYNC_QUEUE_MIN_BACKOFF_SECONDS = 60;
const TRAKT_SYNC_QUEUE_MAX_BACKOFF_SECONDS = 900;
const TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS = 5;
const TRAKT_ENRICHMENT_QUEUE_MIN_BACKOFF_SECONDS = 60;
const TRAKT_ENRICHMENT_QUEUE_MAX_BACKOFF_SECONDS = 900;
const TRAKT_SYNC_QUEUE_REGION = 'us-central1';
const TRAKT_SYNC_QUEUE_FUNCTION = 'locations/us-central1/functions/runTraktSync';
const TRAKT_ENRICHMENT_QUEUE_FUNCTION = 'locations/us-central1/functions/runTraktEnrichment';
const TRAKT_SYNC_QUEUE_DEADLINE_SECONDS = 1800;
const TRAKT_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const TRAKT_ENRICHMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const TRAKT_OAUTH_START_COOLDOWN_MS = 60 * 1000;
const TRAKT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const CORS_ALLOW_HEADERS = 'Authorization, Content-Type';
const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';
const CORS_ALLOWED_ORIGINS_ENV = 'TRAKT_ALLOWED_ORIGINS';
const DEV_SYNC_BYPASS_HEADER = 'x-showseek-dev-sync';
const TRAKT_SYNC_LOCKED_ACCOUNT_MESSAGE =
  'Your Trakt account is locked. Contact Trakt support with your username to unlock it.';
const TRAKT_SYNC_RECONNECT_MESSAGE =
  'Your Trakt connection is no longer valid. Disconnect and reconnect Trakt.';
const TRAKT_SYNC_STORAGE_LIMIT_MESSAGE =
  'Your Trakt history is too large to import right now. Please try again later.';
const FIRESTORE_INDEX_ENTRY_LIMIT_PATTERN = /too many index entries/i;
const TRAKT_INCREMENTAL_SCHEMA_VERSION = 1;

type SyncStatusState = 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed';
type SyncSummaryMode = 'bootstrap' | 'incremental';
type TraktSyncErrorCategory =
  | 'auth_invalid'
  | 'internal'
  | 'locked_account'
  | 'storage_limit'
  | 'rate_limited'
  | 'upstream_blocked'
  | 'upstream_unavailable';
type TraktOAuthFailureReason = 'invalid_oauth' | 'rate_limited' | 'upstream_blocked' | 'upstream_unavailable';

interface SyncTaskPayload {
  runId?: unknown;
  userId?: unknown;
}

interface EnrichmentTaskPayload extends SyncTaskPayload {
  includeEpisodes?: unknown;
  lists?: unknown;
}

interface TraktTaskDispatchOptions {
  scheduleDelaySeconds?: number;
  taskId?: string;
}

interface SyncDiagnostics {
  cfRay?: string;
  endpoint?: string;
  retryAfterSeconds?: number;
  retryReason?: string;
  snippet?: string;
  statusCode?: number;
}

interface SyncStatusItems {
  episodes: number;
  favorites: number;
  lists: number;
  movies: number;
  ratings: number;
  shows: number;
  watchlistItems: number;
}

interface TraktSyncStatus {
  attempt: number;
  completedAt?: FirebaseFirestore.Timestamp;
  diagnostics?: SyncDiagnostics;
  errorCategory?: TraktSyncErrorCategory;
  errorMessage?: string;
  errors?: string[];
  itemsSynced: SyncStatusItems;
  lastSyncedAt?: FirebaseFirestore.Timestamp;
  maxAttempts: number;
  nextAllowedSyncAt?: FirebaseFirestore.Timestamp;
  nextRetryAt?: FirebaseFirestore.Timestamp;
  runId: string;
  startedAt?: FirebaseFirestore.Timestamp;
  status: SyncStatusState;
  summaryMode?: SyncSummaryMode;
  updatedAt: FirebaseFirestore.Timestamp;
  userId: string;
}

interface EnrichmentCounts {
  episodes: number;
  items: number;
  lists: number;
}

interface TraktEnrichmentStatus {
  attempt: number;
  completedAt?: FirebaseFirestore.Timestamp;
  counts: EnrichmentCounts;
  diagnostics?: SyncDiagnostics;
  errorCategory?: TraktSyncErrorCategory;
  errorMessage?: string;
  errors?: string[];
  includeEpisodes: boolean;
  lists: string[];
  maxAttempts: number;
  nextAllowedEnrichAt?: FirebaseFirestore.Timestamp;
  nextRetryAt?: FirebaseFirestore.Timestamp;
  runId: string;
  startedAt?: FirebaseFirestore.Timestamp;
  status: SyncStatusState;
  updatedAt: FirebaseFirestore.Timestamp;
  userId: string;
}

interface TraktUserDoc {
  traktAccessToken?: string;
  traktConnected?: boolean;
  traktConnectedAt?: FirebaseFirestore.Timestamp;
  traktEnrichmentStatus?: Partial<TraktEnrichmentStatus>;
  traktIncrementalState?: TraktIncrementalState;
  traktOauthStartAllowedAt?: FirebaseFirestore.Timestamp;
  traktRefreshToken?: string;
  traktSyncStatus?: Partial<TraktSyncStatus>;
  traktTokenExpiresAt?: FirebaseFirestore.Timestamp;
}

interface TraktActivitiesGroup {
  [key: string]: string | undefined;
  rated_at?: string;
  updated_at?: string;
  watched_at?: string;
}

interface TraktLastActivities {
  episodes?: TraktActivitiesGroup;
  favorites?: TraktActivitiesGroup;
  lists?: TraktActivitiesGroup;
  movies?: TraktActivitiesGroup;
  shows?: TraktActivitiesGroup;
  watchlist?: TraktActivitiesGroup;
}

interface TraktIncrementalCustomListState {
  slug: string;
  updatedAt: string;
}

interface TraktIncrementalState {
  bootstrapCompletedAt: FirebaseFirestore.Timestamp;
  customLists: Record<string, TraktIncrementalCustomListState>;
  lastActivities: TraktLastActivities;
  schemaVersion: typeof TRAKT_INCREMENTAL_SCHEMA_VERSION;
  updatedAt: FirebaseFirestore.Timestamp;
}

interface TraktOAuthStateDoc {
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  used: boolean;
  usedAt?: FirebaseFirestore.Timestamp;
  userId: string;
}

interface TraktIds {
  imdb?: string;
  slug: string;
  tmdb?: number;
  trakt: number;
  tvdb?: number;
}

interface TraktMovie {
  ids: TraktIds;
  title: string;
  year: number;
}

interface TraktShow {
  ids: TraktIds;
  title: string;
  year: number;
}

interface TraktEpisode {
  ids: TraktIds;
  number: number;
  season: number;
  title: string;
}

interface TraktWatchedMovie {
  last_updated_at: string;
  last_watched_at: string;
  movie: TraktMovie;
  plays: number;
}

interface TraktWatchedEpisode {
  last_watched_at: string;
  number: number;
  plays: number;
}

interface TraktWatchedSeason {
  episodes: TraktWatchedEpisode[];
  number: number;
}

interface TraktWatchedShow {
  last_updated_at: string;
  last_watched_at: string;
  plays: number;
  seasons: TraktWatchedSeason[];
  show: TraktShow;
}

interface TraktRating {
  episode?: TraktEpisode;
  movie?: TraktMovie;
  rated_at: string;
  rating: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'season' | 'show';
}

interface TraktList {
  created_at: string;
  description: string;
  ids: TraktIds;
  name: string;
  privacy: 'friends' | 'private' | 'public';
  updated_at: string;
}

interface TraktListItem {
  episode?: TraktEpisode;
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'person' | 'season' | 'show';
}

interface TraktWatchlistItem {
  episode?: TraktEpisode;
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'season' | 'show';
}

interface TraktFavorite {
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'movie' | 'show';
}

interface TraktTokenResponse {
  access_token: string;
  created_at: number;
  expires_in: number;
  refresh_token: string;
}

interface UserProfileResponse {
  user: {
    ids: {
      slug: string;
    };
    name: string;
    private: boolean;
    username: string;
    vip: boolean;
    vip_ep: boolean;
  };
}

interface TraktRequestOptions {
  accessToken: string;
  body?: unknown;
  endpoint: string;
  method?: 'GET' | 'POST';
}

interface TraktHeaderOptions {
  accessToken?: string;
  clientId: string;
  hasJsonBody?: boolean;
}

interface TraktSyncErrorDetails {
  cfRay?: string;
  endpoint?: string;
  retryAfterSeconds?: number;
  snippet?: string;
  statusCode?: number;
}

interface OAuthJsonResponse {
  authUrl?: string;
  error?: string;
  nextAllowedAt?: string;
}

interface SyncResponseBody {
  attempt?: number;
  completedAt?: string;
  connected: boolean;
  diagnostics?: SyncDiagnostics;
  error?: string;
  errorCategory?: TraktSyncErrorCategory;
  errorMessage?: string;
  errors?: string[];
  itemsSynced?: SyncStatusItems;
  lastSyncedAt?: string;
  maxAttempts?: number;
  nextAllowedSyncAt?: string;
  nextRetryAt?: string;
  runId?: string;
  startedAt?: string;
  status?: SyncStatusState;
  summaryMode?: SyncSummaryMode;
  synced: boolean;
}

interface ListEnrichmentStatusResponse {
  exists: boolean;
  hasPosters?: boolean;
  itemCount?: number;
  lastEnriched?: string;
  needsEnrichment?: boolean;
}

interface EnrichmentResponseBody {
  attempt?: number;
  completedAt?: string;
  counts?: EnrichmentCounts;
  diagnostics?: SyncDiagnostics;
  error?: string;
  errorCategory?: TraktSyncErrorCategory;
  errorMessage?: string;
  errors?: string[];
  includeEpisodes?: boolean;
  lists: Record<string, ListEnrichmentStatusResponse>;
  maxAttempts?: number;
  nextAllowedEnrichAt?: string;
  nextRetryAt?: string;
  runId?: string;
  startedAt?: string;
  status: 'idle' | SyncStatusState;
}

interface TMDBMovieDetails {
  genre_ids?: number[];
  poster_path: string | null;
  release_date: string;
  title: string;
  vote_average: number;
}

interface TMDBShowDetails {
  first_air_date: string;
  genre_ids?: number[];
  name: string;
  poster_path: string | null;
  vote_average: number;
}

interface TMDBSeasonResponse {
  episodes: {
    air_date: string | null;
    episode_number: number;
    id: number;
    name: string;
  }[];
}

class TraktSyncError extends Error {
  category: TraktSyncErrorCategory;
  retryable: boolean;
  cfRay?: string;
  endpoint?: string;
  retryAfterSeconds?: number;
  snippet?: string;
  statusCode?: number;

  constructor(
    message: string,
    category: TraktSyncErrorCategory,
    retryable: boolean,
    details: TraktSyncErrorDetails = {}
  ) {
    super(message);
    this.name = 'TraktSyncError';
    this.category = category;
    this.retryable = retryable;
    this.cfRay = details.cfRay;
    this.endpoint = details.endpoint;
    this.retryAfterSeconds = details.retryAfterSeconds;
    this.snippet = details.snippet;
    this.statusCode = details.statusCode;
  }
}

class TraktOAuthError extends Error {
  cfRay?: string;
  reason: TraktOAuthFailureReason;
  snippet?: string;
  statusCode?: number;

  constructor(
    message: string,
    reason: TraktOAuthFailureReason,
    details: {
      cfRay?: string;
      snippet?: string;
      statusCode?: number;
    } = {}
  ) {
    super(message);
    this.name = 'TraktOAuthError';
    this.reason = reason;
    this.cfRay = details.cfRay;
    this.snippet = details.snippet;
    this.statusCode = details.statusCode;
  }
}

const ACTIVE_RUN_STATUSES = new Set<SyncStatusState>(['queued', 'in_progress', 'retrying']);
const DEFAULT_ENRICHMENT_LIST_IDS = ['already-watched', 'watchlist', 'favorites'] as const;
const TRAKT_MANAGED_DEFAULT_LIST_NAMES = {
  'already-watched': 'Already Watched',
  favorites: 'Favorites',
  watchlist: 'Should Watch',
} as const;

const getManualSyncCooldownTimestamp = (
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

const getRateLimitedSyncCooldownTimestamp = (
  error: TraktSyncError
): FirebaseFirestore.Timestamp | undefined =>
  error.category === 'rate_limited' && error.retryAfterSeconds
    ? Timestamp.fromMillis(Date.now() + error.retryAfterSeconds * 1000)
    : undefined;

interface SecretLike {
  value(): string;
}

const emptyItemsSynced = (): SyncStatusItems => ({
  episodes: 0,
  favorites: 0,
  lists: 0,
  movies: 0,
  ratings: 0,
  shows: 0,
  watchlistItems: 0,
});

const emptyEnrichmentCounts = (): EnrichmentCounts => ({
  episodes: 0,
  items: 0,
  lists: 0,
});

const getSyncSummaryMode = (
  incrementalState?: TraktIncrementalState
): SyncSummaryMode =>
  !incrementalState || incrementalState.schemaVersion !== TRAKT_INCREMENTAL_SCHEMA_VERSION
    ? 'bootstrap'
    : 'incremental';

const buildTaskDispatchOptions = ({
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

const getAllowedCorsOrigin = (request: Request): string | undefined => {
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

const applyCorsHeaders = (request: Request, response: ExpressResponse): void => {
  const allowedOrigin = getAllowedCorsOrigin(request);
  response.setHeader('Vary', 'Origin');
  if (allowedOrigin) {
    response.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  }
  response.setHeader('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
  response.setHeader('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
};

const isFunctionsEmulator = (): boolean => process.env.FUNCTIONS_EMULATOR === 'true';

const shouldBypassManualSyncCooldown = (request: Request): boolean =>
  isFunctionsEmulator() && request.header(DEV_SYNC_BYPASS_HEADER) === 'true';

const sendCorsPreflight = (request: Request, response: ExpressResponse): void => {
  applyCorsHeaders(request, response);
  response.status(204).send('');
};

const trimSecret = (secret: SecretLike, secretName: string): string => {
  const value = secret.value().trim();
  if (!value) {
    throw new TraktSyncError(`${secretName} is not configured.`, 'internal', false);
  }
  return value;
};

const sanitizeSnippet = (rawBody: string): string | undefined => {
  const compact = rawBody.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return undefined;
  }
  return compact.slice(0, 240);
};

const parseRetryAfterSeconds = (headerValue: string | null): number | undefined => {
  if (!headerValue) {
    return undefined;
  }

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds;
  }

  const dateMillis = Date.parse(headerValue);
  if (Number.isNaN(dateMillis)) {
    return undefined;
  }

  return Math.max(0, Math.ceil((dateMillis - Date.now()) / 1000));
};

const isCloudflareBlockedResponse = (
  status: number,
  contentType: string,
  rawBody: string,
  cfRay?: string
): boolean => {
  const lowerBody = rawBody.toLowerCase();
  const isHtmlResponse = contentType.includes('text/html');

  if (status === 403 && (cfRay || isHtmlResponse)) {
    return true;
  }

  return (
    lowerBody.includes('cloudflare') ||
    lowerBody.includes('attention required') ||
    lowerBody.includes('you have been blocked') ||
    lowerBody.includes('cf-ray')
  );
};

const toIsoString = (value?: FirebaseFirestore.Timestamp): string | undefined =>
  value instanceof Timestamp ? value.toDate().toISOString() : undefined;

const serializeSyncStatus = (
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

const getSyncResponseBody = (userData?: TraktUserDoc | null): SyncResponseBody => {
  const syncStatus = userData?.traktSyncStatus;
  return {
    connected: Boolean(userData?.traktConnected),
    synced: Boolean(syncStatus?.lastSyncedAt),
    ...serializeSyncStatus(syncStatus),
  };
};

const buildRateLimitedSyncResponse = (
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

const serializeEnrichmentStatus = (
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

const buildRateLimitedEnrichmentResponse = (
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

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const renderSuccessHtml = (): string => `<!doctype html>
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

const getErrorCopy = (reason: TraktOAuthFailureReason): { description: string; title: string } => {
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

const renderErrorHtml = (
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

const extractBearerToken = (request: Request): string | null => {
  const authorization = request.header('authorization');
  if (!authorization) {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const verifyUser = async (request: Request): Promise<admin.auth.DecodedIdToken> => {
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

const sendJsonError = (
  request: Request,
  response: ExpressResponse,
  statusCode: number,
  payload: Record<string, unknown>
): void => {
  applyCorsHeaders(request, response);
  response.status(statusCode).json(payload);
};

const sendMethodNotAllowed = (request: Request, response: ExpressResponse): void => {
  sendJsonError(request, response, 405, { error: 'Method Not Allowed' });
};

const sendNotFound = (request: Request, response: ExpressResponse): void => {
  sendJsonError(request, response, 404, { error: 'Not Found' });
};

const parseBody = <T extends Record<string, unknown>>(request: Request): T =>
  ((request.body ?? {}) as T);

const getOAuthConfig = (): { clientId: string; clientSecret: string; redirectUri: string } => ({
  clientId: trimSecret(TRAKT_CLIENT_ID, 'TRAKT_CLIENT_ID'),
  clientSecret: trimSecret(TRAKT_CLIENT_SECRET, 'TRAKT_CLIENT_SECRET'),
  redirectUri: trimSecret(TRAKT_REDIRECT_URI, 'TRAKT_REDIRECT_URI'),
});

const buildTraktHeaders = ({
  accessToken,
  clientId,
  hasJsonBody = false,
}: TraktHeaderOptions): Record<string, string> => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': TRAKT_APP_USER_AGENT,
    'trakt-api-key': clientId,
    'trakt-api-version': TRAKT_API_VERSION,
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  return headers;
};

const requestOAuthToken = async (
  body: Record<string, string>,
  operation: 'exchange' | 'refresh'
): Promise<TraktTokenResponse> => {
  const { clientId } = getOAuthConfig();
  let response: globalThis.Response;

  try {
    response = await fetch(`${TRAKT_API_BASE}/oauth/token`, {
      method: 'POST',
      headers: buildTraktHeaders({
        clientId,
        hasJsonBody: true,
      }),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TRAKT_OAUTH_TIMEOUT_MS),
    });
  } catch {
    const message =
      operation === 'exchange'
        ? 'Token exchange request timed out or failed.'
        : 'Token refresh request timed out or failed.';
    throw new TraktOAuthError(message, 'upstream_unavailable');
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const cfRay = response.headers.get('cf-ray') ?? undefined;
  const rawBody = await response.text();
  const snippet = sanitizeSnippet(rawBody);

  if (response.ok) {
    try {
      const parsed = JSON.parse(rawBody) as Partial<TraktTokenResponse>;
      if (
        typeof parsed.access_token === 'string' &&
        typeof parsed.refresh_token === 'string' &&
        typeof parsed.expires_in === 'number' &&
        typeof parsed.created_at === 'number'
      ) {
        return parsed as TraktTokenResponse;
      }
    } catch {
      // Ignore parse errors below.
    }

    throw new TraktOAuthError('Trakt OAuth returned an unexpected response.', 'upstream_unavailable', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 429) {
    throw new TraktOAuthError('Trakt OAuth start is rate limited.', 'rate_limited', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (isCloudflareBlockedResponse(response.status, contentType, rawBody, cfRay)) {
    throw new TraktOAuthError('Trakt OAuth request was blocked upstream.', 'upstream_blocked', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status >= 500) {
    throw new TraktOAuthError('Trakt OAuth is temporarily unavailable.', 'upstream_unavailable', {
      cfRay,
      snippet,
      statusCode: response.status,
    });
  }

  throw new TraktOAuthError('Trakt OAuth rejected the request.', 'invalid_oauth', {
    cfRay,
    snippet,
    statusCode: response.status,
  });
};

const exchangeAuthorizationCode = async (code: string): Promise<TraktTokenResponse> => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return requestOAuthToken(
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    'exchange'
  );
};

const refreshAccessToken = async (refreshToken: string): Promise<TraktTokenResponse> => {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return requestOAuthToken(
    {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      redirect_uri: redirectUri,
      refresh_token: refreshToken,
    },
    'refresh'
  );
};

const createOAuthState = async (userId: string): Promise<{ authUrl: string; nextAllowedAt: Timestamp }> => {
  const { clientId, redirectUri } = getOAuthConfig();
  const db = admin.firestore();
  const userRef = db.collection('users').doc(userId);
  const nowMillis = Date.now();
  const now = Timestamp.fromMillis(nowMillis);
  const nextAllowedAt = Timestamp.fromMillis(nowMillis + TRAKT_OAUTH_START_COOLDOWN_MS);
  const expiresAt = Timestamp.fromMillis(nowMillis + TRAKT_OAUTH_STATE_TTL_MS);
  const state = crypto.randomUUID().replace(/-/g, '');
  const stateRef = db.collection('traktOAuthStates').doc(state);

  await db.runTransaction(async (transaction) => {
    const userSnapshot = await transaction.get(userRef);
    const userData = (userSnapshot.data() ?? {}) as TraktUserDoc;
    const currentAllowedAt = userData.traktOauthStartAllowedAt;

    if (currentAllowedAt instanceof Timestamp && currentAllowedAt.toMillis() > nowMillis) {
      throw new TraktOAuthError('Please wait before trying to connect Trakt again.', 'rate_limited', {
        statusCode: 429,
      });
    }

    transaction.set(
      stateRef,
      {
        createdAt: now,
        expiresAt,
        used: false,
        userId,
      } satisfies TraktOAuthStateDoc,
      { merge: true }
    );

    transaction.set(
      userRef,
      {
        traktOauthStartAllowedAt: nextAllowedAt,
      },
      { merge: true }
    );
  });

  const authUrl =
    `https://trakt.tv/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;

  return { authUrl, nextAllowedAt };
};

const consumeOAuthState = async (state: string): Promise<string> => {
  const db = admin.firestore();
  const stateRef = db.collection('traktOAuthStates').doc(state);

  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(stateRef);
    if (!snapshot.exists) {
      throw new TraktOAuthError('Missing OAuth state.', 'invalid_oauth', { statusCode: 400 });
    }

    const stateData = snapshot.data() as TraktOAuthStateDoc;
    if (stateData.used) {
      throw new TraktOAuthError('OAuth state already used.', 'invalid_oauth', { statusCode: 400 });
    }

    if (!(stateData.expiresAt instanceof Timestamp) || stateData.expiresAt.toMillis() < Date.now()) {
      throw new TraktOAuthError('OAuth state expired.', 'invalid_oauth', { statusCode: 400 });
    }

    transaction.set(
      stateRef,
      {
        used: true,
        usedAt: Timestamp.now(),
      },
      { merge: true }
    );

    return stateData.userId;
  });
};

const traktRequest = async <T>({
  accessToken,
  endpoint,
  method = 'GET',
  body,
}: TraktRequestOptions): Promise<T> => {
  const { clientId } = getOAuthConfig();
  let response: globalThis.Response;
  const hasJsonBody = body !== undefined;

  try {
    response = await fetch(`${TRAKT_API_BASE}${endpoint}`, {
      method,
      headers: buildTraktHeaders({
        accessToken,
        clientId,
        hasJsonBody,
      }),
      body: hasJsonBody ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TRAKT_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TraktSyncError('Trakt API request timed out or failed.', 'upstream_unavailable', true, {
      endpoint,
    });
  }

  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  const cfRay = response.headers.get('cf-ray') ?? undefined;
  const retryAfterSeconds = parseRetryAfterSeconds(response.headers.get('retry-after'));
  const rawBody = await response.text();
  const snippet = sanitizeSnippet(rawBody);

  if (response.status === 423) {
    throw new TraktSyncError(TRAKT_SYNC_LOCKED_ACCOUNT_MESSAGE, 'locked_account', false, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 429) {
    throw new TraktSyncError('Trakt rate limited the sync request.', 'rate_limited', true, {
      cfRay,
      endpoint,
      retryAfterSeconds,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status === 401) {
    throw new TraktSyncError(TRAKT_SYNC_RECONNECT_MESSAGE, 'auth_invalid', false, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (isCloudflareBlockedResponse(response.status, contentType, rawBody, cfRay)) {
    throw new TraktSyncError('Trakt blocked the request upstream.', 'upstream_blocked', true, {
      cfRay,
      endpoint,
      snippet,
      statusCode: response.status,
    });
  }

  if (response.status >= 500) {
    throw new TraktSyncError('Trakt is temporarily unavailable.', 'upstream_unavailable', true, {
      cfRay,
      endpoint,
      retryAfterSeconds,
      snippet,
      statusCode: response.status,
    });
  }

  throw new TraktSyncError(`Trakt API request failed with status ${response.status}.`, 'internal', false, {
    cfRay,
    endpoint,
    retryAfterSeconds,
    snippet,
    statusCode: response.status,
  });
};

const getUserProfile = async (accessToken: string): Promise<UserProfileResponse['user']> => {
  const response = await traktRequest<UserProfileResponse>({
    accessToken,
    endpoint: '/users/settings',
  });
  return response.user;
};

const getWatchedMovies = (accessToken: string): Promise<TraktWatchedMovie[]> =>
  traktRequest({
    accessToken,
    endpoint: '/sync/watched/movies',
  });

const getWatchedShows = (accessToken: string): Promise<TraktWatchedShow[]> =>
  traktRequest({
    accessToken,
    endpoint: '/sync/watched/shows?extended=full',
  });

const getRatings = (accessToken: string): Promise<TraktRating[]> =>
  traktRequest({
    accessToken,
    endpoint: '/sync/ratings',
  });

const getUserLists = (accessToken: string, username: string): Promise<TraktList[]> =>
  traktRequest({
    accessToken,
    endpoint: `/users/${username}/lists`,
  });

const getListItems = (accessToken: string, username: string, listId: string): Promise<TraktListItem[]> =>
  traktRequest({
    accessToken,
    endpoint: `/users/${username}/lists/${listId}/items`,
  });

const getWatchlist = (accessToken: string): Promise<TraktWatchlistItem[]> =>
  traktRequest({
    accessToken,
    endpoint: '/sync/watchlist',
  });

const getFavorites = (accessToken: string): Promise<TraktFavorite[]> =>
  traktRequest({
    accessToken,
    endpoint: '/sync/favorites',
  });

const getLastActivities = async (accessToken: string): Promise<TraktLastActivities> => {
  const activities = await traktRequest<Record<string, unknown>>({
    accessToken,
    endpoint: '/sync/last_activities',
  });

  return {
    episodes: isPlainObject(activities.episodes) ? (activities.episodes as TraktActivitiesGroup) : undefined,
    favorites: isPlainObject(activities.favorites) ? (activities.favorites as TraktActivitiesGroup) : undefined,
    lists: isPlainObject(activities.lists) ? (activities.lists as TraktActivitiesGroup) : undefined,
    movies: isPlainObject(activities.movies) ? (activities.movies as TraktActivitiesGroup) : undefined,
    shows: isPlainObject(activities.shows) ? (activities.shows as TraktActivitiesGroup) : undefined,
    watchlist: isPlainObject(activities.watchlist) ? (activities.watchlist as TraktActivitiesGroup) : undefined,
  };
};

const isListMediaType = (value: unknown): value is 'movie' | 'tv' => value === 'movie' || value === 'tv';

const isTimestampLike = (value: unknown): value is { toMillis: () => number } =>
  typeof value === 'object' && value !== null && typeof (value as { toMillis?: unknown }).toMillis === 'function';

const areValuesEqual = (left: unknown, right: unknown): boolean => {
  if (isTimestampLike(left) && isTimestampLike(right)) {
    return left.toMillis() === right.toMillis();
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => areValuesEqual(item, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);

    if (leftKeys.length !== rightKeys.length) {
      return false;
    }

    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  return Object.is(left, right);
};

const hasManagedFieldChanges = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>
): boolean =>
  Object.entries(remoteValue).some(([key, value]) => !areValuesEqual(existingValue?.[key], value));

const mergeManagedValue = (
  existingValue: Record<string, unknown> | undefined,
  remoteValue: Record<string, unknown>
): Record<string, unknown> =>
  (stripUndefinedDeep(
    {
      ...(existingValue ?? {}),
      ...remoteValue,
    },
    true
  ) as Record<string, unknown>) ?? remoteValue;

const normalizeStoredListItems = (
  items: Record<string, unknown> | undefined
): Record<string, Record<string, unknown>> => {
  if (!items || !isPlainObject(items)) {
    return {};
  }

  const normalized: Record<string, Record<string, unknown>> = {};
  const entries = Object.entries(items).filter((entry): entry is [string, Record<string, unknown>] =>
    isPlainObject(entry[1])
  );

  entries.forEach(([rawKey, rawValue]) => {
    const mediaType = rawValue.media_type;
    const mediaId = rawValue.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      if (!normalized[rawKey]) {
        normalized[rawKey] = rawValue;
      }
      return;
    }

    const normalizedKey = buildListItemKey(mediaType, mediaId);
    if (rawKey === normalizedKey) {
      normalized[normalizedKey] = rawValue;
    }
  });

  entries.forEach(([rawKey, rawValue]) => {
    const mediaType = rawValue.media_type;
    const mediaId = rawValue.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      if (!normalized[rawKey]) {
        normalized[rawKey] = rawValue;
      }
      return;
    }

    const normalizedKey = buildListItemKey(mediaType, mediaId);
    if (!normalized[normalizedKey]) {
      normalized[normalizedKey] = rawValue;
      return;
    }

    if (rawKey !== normalizedKey) {
      normalized[normalizedKey] = {
        ...rawValue,
        ...normalized[normalizedKey],
      };
    }
  });

  return normalized;
};

const didActivityFieldChange = (
  previousGroup: TraktActivitiesGroup | undefined,
  nextGroup: TraktActivitiesGroup | undefined,
  field: keyof TraktActivitiesGroup
): boolean => (previousGroup?.[field] ?? null) !== (nextGroup?.[field] ?? null);

const hasActivityGroupChanged = (
  previousGroup: TraktActivitiesGroup | undefined,
  nextGroup: TraktActivitiesGroup | undefined
): boolean => !areValuesEqual(previousGroup ?? {}, nextGroup ?? {});

const normalizeChangedListIds = (listIds: string[]): string[] => Array.from(new Set(listIds.filter(Boolean)));

const transformWatchedMovie = (traktMovie: TraktWatchedMovie): Record<string, unknown> | null => {
  if (!traktMovie.movie.ids.tmdb) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: Timestamp.fromDate(new Date(traktMovie.last_watched_at)),
    id: traktMovie.movie.ids.tmdb,
    media_type: 'movie',
    release_date: traktMovie.movie.year ? `${traktMovie.movie.year}-01-01` : undefined,
    title: traktMovie.movie.title,
  }) as Record<string, unknown>;
};

const transformWatchedShow = (traktShow: TraktWatchedShow): Record<string, unknown> | null => {
  if (!traktShow.show.ids.tmdb) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: Timestamp.fromDate(new Date(traktShow.last_watched_at)),
    first_air_date: traktShow.show.year ? `${traktShow.show.year}-01-01` : undefined,
    id: traktShow.show.ids.tmdb,
    media_type: 'tv',
    name: traktShow.show.title,
  }) as Record<string, unknown>;
};

const transformRating = (traktRating: TraktRating): Record<string, unknown> | null => {
  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;

  if (traktRating.movie) {
    tmdbId = traktRating.movie.ids.tmdb;
    mediaType = 'movie';
    title = traktRating.movie.title;
  } else if (traktRating.show) {
    tmdbId = traktRating.show.ids.tmdb;
    mediaType = 'tv';
    title = traktRating.show.title;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return {
    id: `${mediaType}-${tmdbId}`,
    media_type: mediaType,
    ratedAt: Timestamp.fromDate(new Date(traktRating.rated_at)),
    rating: traktRating.rating,
    title,
  };
};

const transformListItem = (
  traktItem: TraktListItem
): { addedAt: FirebaseFirestore.Timestamp; mediaType: 'movie' | 'tv'; title: string; tmdbId: number; traktId?: number } | null => {
  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;
  let traktId: number | undefined;

  if (traktItem.movie) {
    tmdbId = traktItem.movie.ids.tmdb;
    mediaType = 'movie';
    title = traktItem.movie.title;
    traktId = traktItem.movie.ids.trakt;
  } else if (traktItem.show) {
    tmdbId = traktItem.show.ids.tmdb;
    mediaType = 'tv';
    title = traktItem.show.title;
    traktId = traktItem.show.ids.trakt;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: Timestamp.fromDate(new Date(traktItem.listed_at)),
    mediaType,
    title,
    tmdbId,
    traktId,
  }) as {
    addedAt: FirebaseFirestore.Timestamp;
    mediaType: 'movie' | 'tv';
    title: string;
    tmdbId: number;
    traktId?: number;
  };
};

const transformWatchlistItem = (traktItem: TraktWatchlistItem): Record<string, unknown> | null => {
  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;
  let releaseDate: string | undefined;

  if (traktItem.movie) {
    tmdbId = traktItem.movie.ids.tmdb;
    mediaType = 'movie';
    title = traktItem.movie.title;
    releaseDate = traktItem.movie.year ? `${traktItem.movie.year}-01-01` : undefined;
  } else if (traktItem.show) {
    tmdbId = traktItem.show.ids.tmdb;
    mediaType = 'tv';
    title = traktItem.show.title;
    releaseDate = traktItem.show.year ? `${traktItem.show.year}-01-01` : undefined;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return stripUndefinedDeep({
    addedAt: Timestamp.fromDate(new Date(traktItem.listed_at)),
    id: tmdbId,
    media_type: mediaType,
    release_date: releaseDate,
    title,
  }) as Record<string, unknown>;
};

const transformFavorite = (traktFavorite: TraktFavorite): Record<string, unknown> | null => {
  let tmdbId: number | undefined;
  let mediaType: 'movie' | 'tv';
  let title: string;

  if (traktFavorite.movie) {
    tmdbId = traktFavorite.movie.ids.tmdb;
    mediaType = 'movie';
    title = traktFavorite.movie.title;
  } else if (traktFavorite.show) {
    tmdbId = traktFavorite.show.ids.tmdb;
    mediaType = 'tv';
    title = traktFavorite.show.title;
  } else {
    return null;
  }

  if (!tmdbId) {
    return null;
  }

  return {
    addedAt: Timestamp.fromDate(new Date(traktFavorite.listed_at)),
    id: tmdbId,
    media_type: mediaType,
    title,
  };
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const stripUndefinedDeep = (value: unknown, preserveEmptyObject = false): unknown => {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefinedDeep(item))
      .filter((item): item is Exclude<typeof item, undefined> => item !== undefined);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const sanitizedEntries = Object.entries(value)
    .map(([key, nestedValue]) => [key, stripUndefinedDeep(nestedValue)] as const)
    .filter((entry): entry is readonly [string, unknown] => entry[1] !== undefined);

  if (sanitizedEntries.length === 0 && !preserveEmptyObject) {
    return undefined;
  }

  return Object.fromEntries(sanitizedEntries);
};

const sanitizeSyncStatusForWrite = (syncStatus: TraktSyncStatus): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(syncStatus, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt sync status.', 'internal', false);
  }

  return sanitized;
};

const sanitizeEnrichmentStatusForWrite = (
  enrichmentStatus: TraktEnrichmentStatus
): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(enrichmentStatus, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt enrichment status.', 'internal', false);
  }

  return sanitized;
};

const sanitizeIncrementalStateForWrite = (
  incrementalState: TraktIncrementalState
): FirebaseFirestore.DocumentData => {
  const sanitized = stripUndefinedDeep(incrementalState, true);
  if (!sanitized || !isPlainObject(sanitized)) {
    throw new TraktSyncError('Failed to serialize Trakt incremental state.', 'internal', false);
  }

  return sanitized;
};

const writeSyncStatus = async (userId: string, runId: string, syncStatus: TraktSyncStatus): Promise<void> => {
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

const writeCompletedSyncResult = async (
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

const writeEnrichmentStatus = async (
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

const getPreviousLastSyncedAt = (
  currentSyncStatus?: Partial<TraktSyncStatus> | null
): FirebaseFirestore.Timestamp | undefined => {
  if (currentSyncStatus?.lastSyncedAt instanceof Timestamp) {
    return currentSyncStatus.lastSyncedAt;
  }
  return undefined;
};

const getPreviousEnrichmentCompletedAt = (
  enrichmentStatus?: Partial<TraktEnrichmentStatus> | null
): FirebaseFirestore.Timestamp | undefined => {
  if (enrichmentStatus?.completedAt instanceof Timestamp) {
    return enrichmentStatus.completedAt;
  }
  return undefined;
};

const createQueuedSyncStatus = (
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

const createQueuedEnrichmentStatus = (
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

const createFailureStatus = (
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

const createFailureEnrichmentStatus = (
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

const normalizeSyncError = (error: unknown): TraktSyncError => {
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

const maybeRefreshAccessToken = async (userId: string, userData: TraktUserDoc): Promise<string> => {
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

const buildManagedListItemsMap = (
  items: Array<Record<string, unknown> | null>
): Record<string, Record<string, unknown>> => {
  const mappedItems: Record<string, Record<string, unknown>> = {};

  items.forEach((item) => {
    if (!item) {
      return;
    }

    const mediaType = item.media_type;
    const mediaId = item.id;
    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      return;
    }

    mappedItems[buildListItemKey(mediaType, mediaId)] = item;
  });

  return mappedItems;
};

const buildAlreadyWatchedItemsMap = (
  watchedMovies: TraktWatchedMovie[],
  watchedShows: TraktWatchedShow[]
): Record<string, Record<string, unknown>> =>
  buildManagedListItemsMap([
    ...watchedMovies.map((item) => transformWatchedMovie(item)),
    ...watchedShows.map((item) => transformWatchedShow(item)),
  ]);

const buildWatchlistItemsMap = (
  traktWatchlist: TraktWatchlistItem[]
): Record<string, Record<string, unknown>> =>
  buildManagedListItemsMap(traktWatchlist.map((item) => transformWatchlistItem(item)));

const buildFavoriteItemsMap = (
  traktFavorites: TraktFavorite[]
): Record<string, Record<string, unknown>> =>
  buildManagedListItemsMap(traktFavorites.map((item) => transformFavorite(item)));

const buildCustomListItemsMap = (
  traktItems: TraktListItem[]
): Record<string, Record<string, unknown>> => {
  const items: Record<string, Record<string, unknown>> = {};

  for (const traktItem of traktItems) {
    const transformed = transformListItem(traktItem);
    if (!transformed) {
      continue;
    }

    items[buildListItemKey(transformed.mediaType, transformed.tmdbId)] = stripUndefinedDeep(
      {
        addedAt: transformed.addedAt,
        id: transformed.tmdbId,
        media_type: transformed.mediaType,
        title: transformed.title,
        traktId: transformed.traktId,
      },
      true
    ) as Record<string, unknown>;
  }

  return items;
};

const buildEpisodeTrackingDoc = (
  traktShow: TraktWatchedShow
): { metadata: { tvShowName: string }; showId: string; episodes: Record<string, Record<string, unknown>> } | null => {
  if (!traktShow.show.ids.tmdb) {
    return null;
  }

  const episodes: Record<string, Record<string, unknown>> = {};
  traktShow.seasons.forEach((season) => {
    season.episodes.forEach((episode) => {
      const key = `${season.number}_${episode.number}`;
      episodes[key] = {
        watched: true,
        watchedAt: Timestamp.fromDate(new Date(episode.last_watched_at)),
      };
    });
  });

  return {
    episodes,
    metadata: {
      tvShowName: traktShow.show.title,
    },
    showId: traktShow.show.ids.tmdb.toString(),
  };
};

const buildRatingsMap = (traktRatings: TraktRating[]): Record<string, Record<string, unknown>> => {
  const remoteRatings: Record<string, Record<string, unknown>> = {};

  traktRatings.forEach((traktRating) => {
    const transformed = transformRating(traktRating);
    if (!transformed) {
      return;
    }

    remoteRatings[String(transformed.id)] = transformed;
  });

  return remoteRatings;
};

const countManagedListItemsByMediaType = (
  items: Record<string, Record<string, unknown>>,
  mediaType: 'movie' | 'tv'
): number =>
  Object.values(items).filter((item) => item.media_type === mediaType).length;

const countMediaTypeChanges = (mediaTypes: Array<'movie' | 'tv'>, mediaType: 'movie' | 'tv'): number =>
  mediaTypes.filter((value) => value === mediaType).length;

const reconcileManagedList = async (
  userId: string,
  listId: string,
  remoteItems: Record<string, Record<string, unknown>>,
  baseData: Record<string, unknown>,
  existingSnapshot?: FirebaseFirestore.DocumentSnapshot
): Promise<{
  changedCount: number;
  changedMediaTypes: Array<'movie' | 'tv'>;
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
  const changedMediaTypes: Array<'movie' | 'tv'> = [];
  let changedCount = 0;
  let addedOrUpdatedCount = 0;

  Object.entries(remoteItems).forEach(([remoteKey, remoteItem]) => {
    const mediaType = remoteItem.media_type;
    const mediaId = remoteItem.id;

    if (!isListMediaType(mediaType) || typeof mediaId !== 'number') {
      return;
    }

    const existingItem = existingItems[remoteKey];
    const legacyKey = getLegacyListItemKey(mediaId);
    const hasLegacyKey = Boolean(existingItemsRaw && legacyKey !== remoteKey && legacyKey in existingItemsRaw);
    const itemChanged = !existingItem || hasLegacyKey || hasManagedFieldChanges(existingItem, remoteItem);

    if (itemChanged) {
      itemChanges[remoteKey] = mergeManagedValue(existingItem, remoteItem);
      changedMediaTypes.push(mediaType);
      changedCount += 1;
      addedOrUpdatedCount += 1;
    }

    if (hasLegacyKey) {
      itemChanges[legacyKey] = FieldValue.delete();
    }
  });

  Object.entries(existingItems).forEach(([existingKey, existingItem]) => {
    if (remoteItems[existingKey]) {
      return;
    }

    itemChanges[existingKey] = FieldValue.delete();

    const mediaType = existingItem.media_type;
    const mediaId = existingItem.id;
    if (isListMediaType(mediaType)) {
      changedMediaTypes.push(mediaType);
    }
    if (typeof mediaId === 'number' && existingItemsRaw) {
      const legacyKey = getLegacyListItemKey(mediaId);
      if (legacyKey !== existingKey && legacyKey in existingItemsRaw) {
        itemChanges[legacyKey] = FieldValue.delete();
      }
    }

    changedCount += 1;
  });

  const existingMetadata = isPlainObject(existingData.metadata)
    ? (existingData.metadata as Record<string, unknown>)
    : {};
  const nextNeedsEnrichment = Boolean(existingMetadata.needsEnrichment) || addedOrUpdatedCount > 0;
  const baseDataChanged = hasManagedFieldChanges(existingData, baseData);
  const shouldWrite = !snapshot.exists || changedCount > 0 || baseDataChanged;

  if (!shouldWrite) {
    return {
      changedCount: 0,
      changedMediaTypes: [],
      didWrite: false,
      shouldEnrich: false,
    };
  }

  const payload = stripUndefinedDeep(
    {
      ...baseData,
      items:
        changedCount > 0
          ? itemChanges
          : !snapshot.exists
            ? {}
            : undefined,
      metadata: {
        ...existingMetadata,
        itemCount: Object.keys(remoteItems).length,
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
    didWrite: true,
    shouldEnrich: addedOrUpdatedCount > 0,
  };
};

const reconcileEpisodeTracking = async (
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

      if (!existingEpisode || hasManagedFieldChanges(existingEpisode, remoteEpisode)) {
        episodeChanges[episodeKey] = mergeManagedValue(existingEpisode, remoteEpisode);
        changedEpisodes += 1;
        docChanged = true;
      }
    });

    Object.keys(existingEpisodes).forEach((episodeKey) => {
      if (remoteDoc.episodes[episodeKey]) {
        return;
      }

      episodeChanges[episodeKey] = FieldValue.delete();
      changedEpisodes += 1;
      docChanged = true;
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

  existingDocs.forEach((doc) => {
    const existingData = doc.data() as Record<string, unknown>;
    const existingEpisodes = isPlainObject(existingData.episodes)
      ? (existingData.episodes as Record<string, unknown>)
      : {};
    changedEpisodes += Object.keys(existingEpisodes).length;
    batch.delete(doc.ref);
    writeCount += 1;
  });

  if (writeCount > 0) {
    await batch.commit();
  }

  return {
    changedCount: changedEpisodes,
    itemCount: importedEpisodes,
  };
};

const reconcileRatings = async (
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

    if (!existingDoc || hasManagedFieldChanges(existingData, remoteRating)) {
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

  existingDocs.forEach((doc) => {
    batch.delete(doc.ref);
    changedCount += 1;
    writeCount += 1;
  });

  if (writeCount > 0) {
    await batch.commit();
  }

  return {
    changedCount,
    itemCount: Object.keys(remoteRatings).length,
  };
};

const syncWatchlist = async (
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
    }
  );

  return {
    changedCount: result.changedCount,
    itemCount: Object.keys(remoteItems).length,
    shouldEnrich: result.shouldEnrich,
  };
};

const syncFavorites = async (
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
    }
  );

  return {
    changedCount: result.changedCount,
    itemCount: Object.keys(remoteItems).length,
    shouldEnrich: result.shouldEnrich,
  };
};

const syncCustomLists = async (
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
      }
    );

    if (result.didWrite) {
      changedCount += 1;
    }
  }

  return changedCount;
};

const reconcileCustomLists = async (
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
      localTraktLists.get(listId)
    );

    if (result.didWrite) {
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

const syncTraktImport = async (
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
  }

  if (shouldSyncRatings) {
    const ratings = await getRatings(accessToken);
    const result = await reconcileRatings(userId, ratings);
    itemsSynced.ratings = summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
  }

  if (shouldSyncWatchlist) {
    const watchlist = await getWatchlist(accessToken);
    const result = await syncWatchlist(userId, watchlist);
    itemsSynced.watchlistItems =
      summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
    if (result.shouldEnrich) {
      listsToEnrich.push('watchlist');
    }
  }

  if (shouldSyncFavorites) {
    const favorites = await getFavorites(accessToken);
    const result = await syncFavorites(userId, favorites);
    itemsSynced.favorites = summaryMode === 'bootstrap' ? result.itemCount : result.changedCount;
    if (result.shouldEnrich) {
      listsToEnrich.push('favorites');
    }
  }

  if (shouldSyncCustomLists) {
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

const prepareEnrichmentRun = async (
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

const dispatchEnrichmentRun = async (status: TraktEnrichmentStatus): Promise<void> => {
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

const parseTaskPayload = (payload: SyncTaskPayload): { runId: string; userId: string } => {
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

const normalizeListIds = (listIds: string[]): string[] =>
  Array.from(new Set(listIds.map((listId) => listId.trim()).filter(Boolean)));

const parseEnrichmentTaskPayload = (
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

const enqueueSyncRun = async (
  payload: { runId: string; userId: string },
  options?: TraktTaskDispatchOptions
): Promise<void> => {
  await getFunctions()
    .taskQueue<{ runId: string; userId: string }>(TRAKT_SYNC_QUEUE_FUNCTION)
    .enqueue(payload, buildTaskDispatchOptions(options));
};

const enqueueEnrichmentRun = async (
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

const resolveEnrichmentListIds = async (
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

const getEnrichmentListStatuses = async (
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

const normalizePath = (request: Request): string => {
  const path = (request.path || '/').replace(/\/+$/, '');
  return path || '/';
};

const fetchTMDBJson = async <T>(path: string): Promise<T | null> => {
  const apiKey = trimSecret(TMDB_API_KEY, 'TMDB_API_KEY');

  try {
    const response = await fetch(`${TMDB_API_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${encodeURIComponent(apiKey)}`, {
      signal: AbortSignal.timeout(TRAKT_REQUEST_TIMEOUT_MS),
    });

    if (response.status === 404) {
      return null;
    }

    if (response.status === 429) {
      throw new TraktSyncError('TMDB rate limited the enrichment request.', 'rate_limited', true, {
        endpoint: path,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
        statusCode: response.status,
      });
    }

    if (response.status >= 500) {
      throw new TraktSyncError('TMDB is temporarily unavailable.', 'upstream_unavailable', true, {
        endpoint: path,
        retryAfterSeconds: parseRetryAfterSeconds(response.headers.get('retry-after')),
        statusCode: response.status,
      });
    }

    if (response.status === 401 || response.status === 403) {
      throw new TraktSyncError('TMDB enrichment is not configured correctly.', 'internal', false, {
        endpoint: path,
        statusCode: response.status,
      });
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof TraktSyncError) {
      throw error;
    }

    throw new TraktSyncError('TMDB request timed out or failed.', 'upstream_unavailable', true, {
      endpoint: path,
    });
  }
};

const enrichMediaItem = async (item: Record<string, unknown>): Promise<Record<string, unknown>> => {
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

const enrichMediaItems = async (
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

const enrichEpisodeTracking = async (
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

const runTraktEnrichmentJob = async (
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

const buildEnrichmentResponseBody = async (
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

const handleOAuthStart = async (request: Request, response: ExpressResponse): Promise<void> => {
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

const handleSyncPost = async (request: Request, response: ExpressResponse): Promise<void> => {
  if (request.method !== 'POST') {
    sendMethodNotAllowed(request, response);
    return;
  }

  try {
    const decodedToken = await verifyUser(request);
    const userId = decodedToken.uid;
    const bypassManualCooldown = shouldBypassManualSyncCooldown(request);
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

      if (!bypassManualCooldown) {
        const nextAllowedSyncAt = getManualSyncCooldownTimestamp(existingStatus);
        if (nextAllowedSyncAt instanceof Timestamp && nextAllowedSyncAt.toMillis() > Date.now()) {
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

const handleSyncGet = async (request: Request, response: ExpressResponse): Promise<void> => {
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

const handleDisconnect = async (request: Request, response: ExpressResponse): Promise<void> => {
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

const handleEnrichPost = async (request: Request, response: ExpressResponse): Promise<void> => {
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

    if (transactionResult.kind === 'active') {
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

const handleEnrichGet = async (request: Request, response: ExpressResponse): Promise<void> => {
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

      const counts = await runTraktEnrichmentJob(userId, lists, includeEpisodes, runId);
      const completedAt = Timestamp.now();

      await writeEnrichmentStatus(userId, runId, {
        attempt,
        completedAt,
        counts,
        includeEpisodes,
        lists,
        maxAttempts: TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS,
        nextAllowedEnrichAt,
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
  enrichEpisodeTracking,
  getAllowedCorsOrigin,
  sanitizeEnrichmentStatusForWrite,
  sanitizeSyncStatusForWrite,
  syncCustomLists,
};
