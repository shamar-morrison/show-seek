/**
 * Types for the watched movies feature
 */

/**
 * Represents a single watch instance of a movie
 */
export interface WatchInstance {
  /** Unique identifier for this watch instance */
  id: string;
  /** When the movie was watched */
  watchedAt: Date;
  /** TMDB movie ID (stored for easier querying) */
  movieId: number;
}

/**
 * Firestore document structure for a watch instance
 */
export interface WatchInstanceFirestore {
  watchedAt: Date;
  movieId: string;
}

/**
 * Aggregated data for a movie's watch history
 */
export interface WatchedMovieData {
  /** All watch instances for this movie */
  instances: WatchInstance[];
  /** Total number of times watched */
  count: number;
  /** Most recent watch date, null if never watched */
  lastWatchedAt: Date | null;
  /** Whether the data is currently loading */
  isLoading: boolean;
}

/**
 * Options for when the movie was watched
 */
export type WatchDateOption = 'now' | 'release_date' | 'custom';
