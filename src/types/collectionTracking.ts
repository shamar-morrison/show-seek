/**
 * Collection Tracking Types
 *
 * Type definitions for movie collection tracking functionality.
 * Used for storing and managing user's collection progress in Firestore.
 */

/**
 * Minimal data stored in Firestore for a tracked collection.
 * Display data (posters, backdrops) is fetched from TMDB API at render time.
 */
export interface TrackedCollection {
  /** TMDB Collection ID */
  collectionId: number;
  /** Collection name (for display in lists without API call) */
  name: string;
  /** Total number of movies in the collection */
  totalMovies: number;
  /** Array of watched movie IDs within this collection */
  watchedMovieIds: number[];
  /** Timestamp when tracking started */
  startedAt: number;
  /** Timestamp of last update */
  lastUpdated: number;
}

/**
 * Data for display in Collection Progress list.
 * Combines Firestore data with TMDB API data.
 */
export interface CollectionProgressItem {
  collectionId: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
  watchedCount: number;
  totalMovies: number;
  percentage: number;
  lastUpdated: number;
}

/**
 * Movie info needed for collection tracking prompts.
 * Passed when marking a movie as watched.
 */
export interface MovieCollectionInfo {
  /** TMDB Collection ID */
  collectionId: number;
  /** Collection name */
  collectionName: string;
  /** Total movies in the collection */
  totalMovies: number;
}
