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

export interface SyncStatus {
  connected: boolean;
  synced: boolean;
  status?: 'idle' | 'in_progress' | 'completed' | 'failed';
  lastSyncedAt?: string;
  itemsSynced?: TraktSyncItems;
  errors?: string[];
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
  hasPosters: boolean;
  itemCount: number;
  enrichedCount: number;
}

/**
 * Overall enrichment status
 */
export interface EnrichmentStatus {
  status: 'idle' | 'in_progress' | 'completed' | 'failed';
  lists: Record<string, ListEnrichmentStatus>;
  errors?: string[];
}
