/**
 * Trakt Integration Types
 */

export interface TraktSyncItems {
  movies: number;
  shows: number;
  episodes: number;
  ratings: number;
  lists: number;
  favorites: number;
  watchlistItems: number;
}

export type SyncErrorCategory =
  | 'auth_invalid'
  | 'internal'
  | 'locked_account'
  | 'rate_limited'
  | 'upstream_blocked'
  | 'upstream_unavailable';

export interface SyncStatus {
  connected: boolean;
  synced: boolean;
  status?: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed';
  runId?: string;
  attempt?: number;
  maxAttempts?: number;
  nextAllowedSyncAt?: string;
  nextRetryAt?: string;
  lastSyncedAt?: string;
  startedAt?: string;
  completedAt?: string;
  itemsSynced?: TraktSyncItems;
  errorCategory?: SyncErrorCategory;
  errorMessage?: string;
  errors?: string[];
  diagnostics?: {
    cfRay?: string;
    endpoint?: string;
    retryAfterSeconds?: number;
    retryReason?: string;
    snippet?: string;
    statusCode?: number;
  };
}

export interface TraktState {
  isConnected: boolean;
  isSyncing: boolean;
  isEnriching: boolean;
  lastSyncedAt: Date | null;
  lastEnrichedAt: Date | null;
  syncStatus: SyncStatus | null;
}

export interface TraktContextValue extends TraktState {
  isLoading: boolean;
  connectTrakt: () => Promise<void>;
  disconnectTrakt: () => Promise<void>;
  syncNow: () => Promise<void>;
  checkSyncStatus: () => Promise<SyncStatus | undefined>;
  enrichData: () => Promise<void>;
}

/**
 * Options for TMDB enrichment
 */
export interface EnrichmentOptions {
  lists?: string[];
  includeEpisodes?: boolean;
}

/**
 * Enrichment status for a list
 */
export interface ListEnrichmentStatus {
  exists: boolean;
  hasPosters?: boolean;
  itemCount?: number;
  lastEnriched?: string;
  needsEnrichment?: boolean;
}

/**
 * Overall enrichment status
 */
export interface EnrichmentStatus {
  status: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed';
  runId?: string;
  attempt?: number;
  maxAttempts?: number;
  nextAllowedEnrichAt?: string;
  nextRetryAt?: string;
  startedAt?: string;
  completedAt?: string;
  includeEpisodes?: boolean;
  counts?: {
    episodes: number;
    items: number;
    lists: number;
  };
  errorCategory?: SyncErrorCategory;
  errorMessage?: string;
  lists: Record<string, ListEnrichmentStatus>;
  errors?: string[];
  diagnostics?: {
    cfRay?: string;
    endpoint?: string;
    retryAfterSeconds?: number;
    retryReason?: string;
    snippet?: string;
    statusCode?: number;
  };
}

/**
 * Trakt Reviews Types
 */

export interface TraktUser {
  username: string;
  name: string;
  ids: { slug: string };
  images?: { avatar?: { full?: string } };
}

export interface TraktReview {
  id: number;
  created_at: string;
  comment: string;
  spoiler: boolean;
  user: TraktUser;
  user_rating: number | null;
  likes: number;
}

export interface TraktSearchResult {
  type: 'movie' | 'show';
  score: number;
  movie?: { ids: { trakt: number; slug: string; tmdb: number } };
  show?: { ids: { trakt: number; slug: string; tmdb: number } };
}
