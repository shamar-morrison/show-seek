/**
 * Episode Tracking Types
 *
 * Type definitions for TV show season and episode tracking functionality.
 * Used for storing and managing user's watched episode progress in Firestore.
 */

/**
 * Represents a single watched episode record
 */
export interface WatchedEpisode {
  /** TMDB episode ID */
  episodeId: number;
  /** TMDB TV show ID */
  tvShowId: number;
  /** Season number (1-based) */
  seasonNumber: number;
  /** Episode number within the season (1-based) */
  episodeNumber: number;
  /** Timestamp when the episode was marked as watched */
  watchedAt: number;
  /** Episode name/title */
  episodeName: string;
  /** Original air date of the episode (ISO string) */
  episodeAirDate: string | null;
}

/**
 * Metadata for a TV show's episode tracking
 */
export interface EpisodeTrackingMetadata {
  /** TV show name */
  tvShowName: string;
  /** Path to show poster image */
  posterPath: string | null;
  /** Timestamp of last update to tracking data */
  lastUpdated: number;
}

/**
 * Complete episode tracking document structure for a TV show
 * Stored at: users/{userId}/episode_tracking/{tvShowId}
 */
export interface TVShowEpisodeTracking {
  /** Map of watched episodes, keyed by "{seasonNumber}_{episodeNumber}" */
  episodes: Record<string, WatchedEpisode>;
  /** Show metadata for display purposes */
  metadata: EpisodeTrackingMetadata;
}

/**
 * Progress data for a single season
 */
export interface SeasonProgress {
  /** Season number */
  seasonNumber: number;
  /** Number of watched episodes */
  watchedCount: number;
  /** Total number of episodes in season */
  totalCount: number;
  /** Total number of aired episodes (excludes unaired/future episodes) */
  totalAiredCount: number;
  /** Progress percentage (0-100) */
  percentage: number;
}

/**
 * Overall progress data for a TV show
 */
export interface ShowProgress {
  /** Total watched episodes across all seasons */
  totalWatched: number;
  /** Total episodes across all seasons */
  totalEpisodes: number;
  /** Total aired episodes across all seasons (excludes unaired/future episodes) */
  totalAiredEpisodes: number;
  /** Overall progress percentage (0-100) */
  percentage: number;
  /** Progress data for each season */
  seasonProgress: SeasonProgress[];
}
