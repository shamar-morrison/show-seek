/**
 * History Types
 *
 * Type definitions for user activity history and statistics functionality.
 */

/**
 * Activity item from any source (watched, rated, or added)
 */
export interface ActivityItem {
  id: string | number;
  type: 'watched' | 'rated' | 'added';
  mediaType: 'movie' | 'tv' | 'episode';
  title: string;
  posterPath: string | null;
  timestamp: number;
  rating?: number;
  listName?: string;
  genreIds?: number[];
  releaseDate?: string | null;
  voteAverage?: number;
  // Episode-specific fields
  seasonNumber?: number;
  episodeNumber?: number;
  tvShowName?: string;
  tvShowId?: number;
}

/**
 * Stats for a single month
 */
export interface MonthlyStats {
  /** Month in "YYYY-MM" format */
  month: string;
  /** Human-readable month name, e.g., "December 2025" */
  monthName: string;
  /** Number of episodes/movies watched */
  watched: number;
  /** Number of items rated */
  rated: number;
  /** Number of items added to lists */
  addedToLists: number;
  /** Average rating for the month (null if no ratings) */
  averageRating: number | null;
  /** Top 3 genre names for the month */
  topGenres: string[];
  /** Percentage change compared to previous month */
  comparisonToPrevious: {
    watched: number;
    rated: number;
    addedToLists: number;
  } | null;
}

/**
 * Detailed data for a specific month
 */
export interface MonthlyDetail {
  month: string;
  monthName: string;
  stats: MonthlyStats;
  items: {
    watched: ActivityItem[];
    rated: ActivityItem[];
    added: ActivityItem[];
  };
}

/**
 * Aggregated history data for the user
 */
export interface HistoryData {
  /** Stats grouped by month (most recent first) */
  monthlyStats: MonthlyStats[];
  /** Current consecutive days with activity */
  currentStreak: number;
  /** Longest streak in the period */
  longestStreak: number;
  /** Most active day of the week (e.g., "Saturday") */
  mostActiveDay: string | null;
  /** Most active time of day (e.g., "Evening") */
  mostActiveTimeOfDay: string | null;
  /** Total episodes/movies watched in the period */
  totalWatched: number;
  /** Total items rated in the period */
  totalRated: number;
  /** Total items added to lists in the period */
  totalAddedToLists: number;
}

/**
 * Raw data fetched from Firestore before aggregation
 */
export interface RawHistoryData {
  watchedItems: {
    timestamp: number;
    genreIds?: number[];
  }[];
  ratedItems: {
    timestamp: number;
    rating: number;
    genreIds?: number[];
  }[];
  addedItems: {
    timestamp: number;
    genreIds?: number[];
    listName: string;
  }[];
}
