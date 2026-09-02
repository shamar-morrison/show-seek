import { defineSecret } from 'firebase-functions/params';
import type { SyncStatusState } from './types';

export const TRAKT_CLIENT_ID = defineSecret('TRAKT_CLIENT_ID');
export const TRAKT_CLIENT_SECRET = defineSecret('TRAKT_CLIENT_SECRET');
export const TRAKT_REDIRECT_URI = defineSecret('TRAKT_REDIRECT_URI');
export const TMDB_API_KEY = defineSecret('TMDB_API_KEY');

export const TRAKT_API_BASE = 'https://api.trakt.tv';
export const TRAKT_API_VERSION = '2';
export const TRAKT_APP_USER_AGENT = 'ShowSeek-TraktFunctions/1.0';
export const TMDB_API_BASE = 'https://api.themoviedb.org/3';
export const TRAKT_REQUEST_TIMEOUT_MS = 20_000;
export const TRAKT_OAUTH_TIMEOUT_MS = 15_000;
export const TRAKT_TOKEN_REFRESH_THRESHOLD_MS = 60 * 60 * 1000;
export const TRAKT_SYNC_QUEUE_MAX_ATTEMPTS = 5;
export const TRAKT_SYNC_QUEUE_MIN_BACKOFF_SECONDS = 60;
export const TRAKT_SYNC_QUEUE_MAX_BACKOFF_SECONDS = 900;
export const TRAKT_ENRICHMENT_QUEUE_MAX_ATTEMPTS = 5;
export const TRAKT_ENRICHMENT_QUEUE_MIN_BACKOFF_SECONDS = 60;
export const TRAKT_ENRICHMENT_QUEUE_MAX_BACKOFF_SECONDS = 900;
export const TRAKT_SYNC_QUEUE_REGION = 'us-central1';
export const TRAKT_SYNC_QUEUE_FUNCTION = 'locations/us-central1/functions/runTraktSync';
export const TRAKT_ENRICHMENT_QUEUE_FUNCTION = 'locations/us-central1/functions/runTraktEnrichment';
export const TRAKT_ZIP_IMPORT_QUEUE_FUNCTION = 'locations/us-central1/functions/runTraktZipImport';
export const TRAKT_ZIP_IMPORT_QUEUE_REGION = 'us-central1';
export const TRAKT_ZIP_IMPORT_QUEUE_DEADLINE_SECONDS = 1800;
export const MAX_ZIP_SIZE_BYTES = 200 * 1024 * 1024;
export const MAX_ZIP_UNCOMPRESSED_ENTRY_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_ZIP_TOTAL_UNCOMPRESSED_SIZE_BYTES = 500 * 1024 * 1024;
export const TRAKT_ZIP_IMPORT_PENDING_STALE_MS = 5 * 60 * 1000;
export const TRAKT_ZIP_IMPORT_PROCESSING_STALE_MS = 35 * 60 * 1000;
export const TRAKT_ZIP_IMPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const TEST_TRAKT_ZIP_IMPORT_COOLDOWN_MS = 10 * 1000;

export const buildTraktZipImportStoragePath = (userId: string, importId: string): string =>
  `users/${userId}/imports/${importId}.zip`;

export const buildTraktZipImportDocPath = (userId: string, importId: string): string =>
  `users/${userId}/trakt_imports/${importId}`;

export const TRAKT_SYNC_QUEUE_DEADLINE_SECONDS = 1800;
export const TRAKT_SYNC_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const TRAKT_ENRICHMENT_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const TRAKT_OAUTH_START_COOLDOWN_MS = 60 * 1000;
export const TRAKT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
export const DEV_SYNC_BYPASS_HEADER = 'x-showseek-dev-sync';
export const CORS_ALLOW_HEADERS = ['Authorization', 'Content-Type', DEV_SYNC_BYPASS_HEADER].join(', ');
export const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';
export const CORS_ALLOWED_ORIGINS_ENV = 'TRAKT_ALLOWED_ORIGINS';
export const TRAKT_SYNC_BYPASS_UIDS_ENV = 'TRAKT_SYNC_BYPASS_UIDS';
export const TRAKT_SYNC_LOCKED_ACCOUNT_MESSAGE =
  'Your Trakt account is locked. Contact Trakt support with your username to unlock it.';
export const TRAKT_SYNC_RECONNECT_MESSAGE =
  'Your Trakt connection is no longer valid. Disconnect and reconnect Trakt.';
export const TRAKT_SYNC_STORAGE_LIMIT_MESSAGE =
  'Your Trakt history is too large to import right now. Please try again later.';
export const FIRESTORE_INDEX_ENTRY_LIMIT_PATTERN = /too many index entries/i;
export const TRAKT_INCREMENTAL_SCHEMA_VERSION = 1;

export const ACTIVE_RUN_STATUSES = new Set<SyncStatusState>(['queued', 'in_progress', 'retrying']);
export const DEFAULT_ENRICHMENT_LIST_IDS = ['already-watched', 'watchlist', 'favorites'] as const;
export const TRAKT_MANAGED_DEFAULT_LIST_NAMES = {
  'already-watched': 'Already Watched',
  favorites: 'Favorites',
  watchlist: 'Should Watch',
} as const;
export const MAX_PAGINATION_PAGES = 50;
