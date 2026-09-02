/**
 * Trakt Integration Types
 */

import type {
  SelectedZipFile,
  TraktZipImportProgressDoc,
} from '@/src/services/TraktZipImportService';

export interface TraktSyncItems {
  movies: number;
  shows: number;
  episodes: number;
  ratings: number;
  lists: number;
  favorites: number;
  watchlistItems: number;
}

export type SyncSummaryMode = 'bootstrap' | 'incremental';

export type SyncErrorCategory =
  | 'auth_invalid'
  | 'internal'
  | 'locked_account'
  | 'storage_limit'
  | 'rate_limited'
  | 'upstream_blocked'
  | 'upstream_unavailable';

export interface SyncStatus {
  connected: boolean;
  synced: boolean;
  status?: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed';
  summaryMode?: SyncSummaryMode;
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

export type TraktZipImportUIState = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

export interface TraktState {
  isConnected: boolean;
  isSyncing: boolean;
  isEnriching: boolean;
  isZipImporting: boolean;
  isZipImportRateLimited: boolean;
  lastSyncedAt: Date | null;
  lastEnrichedAt: Date | null;
  nextAllowedZipImportAt: Date | null;
  syncStatus: SyncStatus | null;
  zipImportUiState: TraktZipImportUIState;
  zipUploadProgress: number;
  zipImportDoc: TraktZipImportProgressDoc | null;
  zipImportError: string | null;
  selectedZipFile: SelectedZipFile | null;
}

export interface TraktContextValue extends TraktState {
  isLoading: boolean;
  connectTrakt: () => Promise<void>;
  disconnectTrakt: () => Promise<void>;
  syncNow: () => Promise<void>;
  checkSyncStatus: () => Promise<SyncStatus | undefined>;
  enrichData: () => Promise<void>;
  startZipImport: (file: SelectedZipFile) => Promise<void>;
  dismissZipImport: () => void;
  setSelectedZipFile: (file: SelectedZipFile | null) => void;
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
