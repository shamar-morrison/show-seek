/**
 * Reminder timing preference
 */
export type ReminderTiming = '1_day_before' | '1_week_before' | 'on_release_day';

/**
 * Media type for reminders (movies only in Phase 1)
 * Will expand to 'movie' | 'tv' in Phase 2
 */
export type ReminderMediaType = 'movie';

/**
 * Reminder document stored in Firestore
 */
export interface Reminder {
  id: string; // Document ID: "movie-{movieId}"
  userId: string;
  mediaType: ReminderMediaType;
  mediaId: number; // TMDB movie ID

  // TMDB metadata (cached for sync)
  title: string;
  posterPath: string | null;
  releaseDate: string; // ISO 8601 YYYY-MM-DD format

  // User preferences
  reminderTiming: ReminderTiming;

  // Scheduling data
  notificationScheduledFor: number; // UTC timestamp (milliseconds)
  localNotificationId: string | null; // Expo notification identifier

  // Status tracking
  status: 'active' | 'cancelled';
  createdAt: number; // UTC timestamp
  updatedAt: number; // UTC timestamp

  // Future TV show fields (commented for Phase 2)
  // tvShowFrequency?: 'every_episode' | 'season_premiere_only';
  // seasonNumber?: number;
  // episodeNumber?: number;
  // episodeName?: string;
}

/**
 * Input for creating a new reminder
 */
export interface CreateReminderInput {
  mediaId: number;
  mediaType: ReminderMediaType;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  reminderTiming: ReminderTiming;
}

/**
 * Input for updating reminder timing
 */
export interface UpdateReminderInput {
  reminderId: string;
  reminderTiming: ReminderTiming;
}
