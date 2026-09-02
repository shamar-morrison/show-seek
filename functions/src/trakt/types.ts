import { TRAKT_INCREMENTAL_SCHEMA_VERSION } from './constants';

export type SyncStatusState = 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed';
export type SyncSummaryMode = 'bootstrap' | 'incremental';
export type TraktSyncErrorCategory =
  | 'auth_invalid'
  | 'internal'
  | 'locked_account'
  | 'storage_limit'
  | 'rate_limited'
  | 'upstream_blocked'
  | 'upstream_unavailable';
export type TraktOAuthFailureReason = 'invalid_oauth' | 'rate_limited' | 'upstream_blocked' | 'upstream_unavailable';
export type ManualSyncCooldownBypassSource = 'allowlist' | 'emulator';

export interface SyncTaskPayload {
  runId?: unknown;
  userId?: unknown;
}

export interface EnrichmentTaskPayload extends SyncTaskPayload {
  includeEpisodes?: unknown;
  lists?: unknown;
}

export interface TraktTaskDispatchOptions {
  scheduleDelaySeconds?: number;
  taskId?: string;
}

export interface SyncDiagnostics {
  cfRay?: string;
  endpoint?: string;
  retryAfterSeconds?: number;
  retryReason?: string;
  snippet?: string;
  statusCode?: number;
}

export interface SyncStatusItems {
  episodes: number;
  favorites: number;
  lists: number;
  movies: number;
  ratings: number;
  shows: number;
  watchlistItems: number;
}

export interface TraktSyncStatus {
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

export interface EnrichmentCounts {
  episodes: number;
  items: number;
  lists: number;
}

export interface TraktEnrichmentStatus {
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
  pendingLists?: string[];
  runId: string;
  startedAt?: FirebaseFirestore.Timestamp;
  status: SyncStatusState;
  updatedAt: FirebaseFirestore.Timestamp;
  userId: string;
}

export interface TraktIncrementalCustomListState {
  slug: string;
  updatedAt: string;
}

export interface TraktActivitiesGroup {
  [key: string]: string | undefined;
  rated_at?: string;
  updated_at?: string;
  watched_at?: string;
}

export interface TraktLastActivities {
  episodes?: TraktActivitiesGroup;
  favorites?: TraktActivitiesGroup;
  lists?: TraktActivitiesGroup;
  movies?: TraktActivitiesGroup;
  shows?: TraktActivitiesGroup;
  watchlist?: TraktActivitiesGroup;
}

export interface TraktIncrementalState {
  bootstrapCompletedAt: FirebaseFirestore.Timestamp;
  customLists: Record<string, TraktIncrementalCustomListState>;
  lastActivities: TraktLastActivities;
  schemaVersion: typeof TRAKT_INCREMENTAL_SCHEMA_VERSION;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface TraktUserZipImportStatus {
  completedAt?: FirebaseFirestore.Timestamp;
  createdAt?: FirebaseFirestore.Timestamp;
  error?: string;
  errorCategory?: TraktZipImportErrorCategory;
  failedAt?: FirebaseFirestore.Timestamp;
  id: string;
  leaseToken?: string;
  nextAllowedImportAt?: FirebaseFirestore.Timestamp;
  phase: TraktZipImportPhase;
  stats?: {
    customLists: number;
    episodes: number;
    favorites: number;
    movies: number;
    movieWatches: number;
    ratings: number;
    shows: number;
    watchlist: number;
  };
  status: TraktZipImportStatus;
  updatedAt: FirebaseFirestore.Timestamp;
}

export interface TraktUserDoc {
  traktAccessToken?: string;
  traktConnected?: boolean;
  traktConnectedAt?: FirebaseFirestore.Timestamp;
  traktEnrichmentStatus?: Partial<TraktEnrichmentStatus>;
  traktIncrementalState?: TraktIncrementalState;
  traktOauthStartAllowedAt?: FirebaseFirestore.Timestamp;
  traktRefreshToken?: string;
  traktSyncStatus?: Partial<TraktSyncStatus>;
  traktTokenExpiresAt?: FirebaseFirestore.Timestamp;
  traktZipImportStatus?: Partial<TraktUserZipImportStatus>;
}

export interface TraktOAuthStateDoc {
  createdAt: FirebaseFirestore.Timestamp;
  expiresAt: FirebaseFirestore.Timestamp;
  used: boolean;
  usedAt?: FirebaseFirestore.Timestamp;
  userId: string;
}

export interface TraktIds {
  imdb?: string;
  slug: string;
  tmdb?: number;
  trakt: number;
  tvdb?: number;
}

export interface TraktMovie {
  ids: TraktIds;
  title: string;
  year: number;
}

export interface TraktShow {
  ids: TraktIds;
  title: string;
  year: number;
}

export interface TraktEpisode {
  ids: TraktIds;
  number: number;
  season: number;
  title: string;
}

export interface TraktWatchedMovie {
  last_updated_at: string;
  last_watched_at: string;
  movie: TraktMovie;
  plays: number;
}

export interface TraktWatchedEpisode {
  last_watched_at: string;
  number: number;
  plays: number;
}

export interface TraktWatchedSeason {
  episodes?: TraktWatchedEpisode[];
  number: number;
}

export interface TraktWatchedShow {
  last_updated_at: string;
  last_watched_at: string;
  plays: number;
  seasons?: TraktWatchedSeason[];
  show: TraktShow;
}

export interface TraktRating {
  episode?: TraktEpisode;
  movie?: TraktMovie;
  rated_at: string;
  rating: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'season' | 'show';
}

export interface TraktList {
  created_at: string;
  description: string;
  ids: TraktIds;
  name: string;
  privacy: 'friends' | 'private' | 'public';
  updated_at: string;
}

export interface TraktListItem {
  episode?: TraktEpisode;
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'person' | 'season' | 'show';
}

export interface TraktWatchlistItem {
  episode?: TraktEpisode;
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'episode' | 'movie' | 'season' | 'show';
}

export interface TraktFavorite {
  id: number;
  listed_at: string;
  movie?: TraktMovie;
  notes?: string;
  rank: number;
  show?: TraktShow;
  type: 'movie' | 'show';
}

export interface TraktTokenResponse {
  access_token: string;
  created_at: number;
  expires_in: number;
  refresh_token: string;
}

export interface UserProfileResponse {
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

export interface TraktRequestOptions {
  accessToken: string;
  body?: unknown;
  endpoint: string;
  method?: 'GET' | 'POST';
}

export interface TraktHeaderOptions {
  accessToken?: string;
  clientId: string;
  hasJsonBody?: boolean;
}

export interface TraktSyncErrorDetails {
  cfRay?: string;
  endpoint?: string;
  retryAfterSeconds?: number;
  snippet?: string;
  statusCode?: number;
}

export interface OAuthJsonResponse {
  authUrl?: string;
  error?: string;
  nextAllowedAt?: string;
}

export interface SyncResponseBody {
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

export interface ListEnrichmentStatusResponse {
  exists: boolean;
  hasPosters?: boolean;
  itemCount?: number;
  lastEnriched?: string;
  needsEnrichment?: boolean;
}

export interface EnrichmentResponseBody {
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

export interface TMDBMovieDetails {
  genre_ids?: number[];
  poster_path: string | null;
  release_date: string;
  title: string;
  vote_average: number;
}

export interface TMDBShowDetails {
  first_air_date: string;
  genre_ids?: number[];
  name: string;
  poster_path: string | null;
  vote_average: number;
}

export interface TMDBSeasonResponse {
  episodes: {
    air_date: string | null;
    episode_number: number;
    id: number;
    name: string;
  }[];
}

export class TraktSyncError extends Error {
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

export class TraktOAuthError extends Error {
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

export interface SecretLike {
  value(): string;
}

export interface TraktRawResponse<T> {
  data: T;
  headers: globalThis.Headers;
}

export interface ReconcileManagedListOptions {
  countBaseDataChangesAsRemoteChange?: boolean;
  preserveLocalItems?: boolean;
  recencyField?: string;
}

export interface StartTraktZipImportRequest {
  importId?: string;
}

export interface TraktZipImportTaskPayload {
  importId: string;
  userId: string;
}

export type TraktZipImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type TraktZipImportPhase = 'pending' | 'downloading' | 'parsing' | 'syncing' | 'completed' | 'failed';
export type TraktZipImportErrorCategory = 'pre_flight' | 'in_flight';

export interface TraktZipImportProgressDoc {
  completedAt?: FirebaseFirestore.Timestamp;
  createdAt: FirebaseFirestore.Timestamp;
  error?: string;
  failedAt?: FirebaseFirestore.Timestamp;
  id: string;
  nextAllowedImportAt?: FirebaseFirestore.Timestamp;
  progress: {
    current: number;
    phase: TraktZipImportPhase;
    total: number;
  };
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
  status: TraktZipImportStatus;
  updatedAt: FirebaseFirestore.Timestamp;
  userId: string;
}

