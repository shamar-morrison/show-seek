/**
 * Reminder timing preference
 * - Movies/Seasons: all three options
 * - Episodes: only 1_day_before and on_release_day
 */
export type ReminderTiming = '1_day_before' | '1_week_before' | 'on_release_day';

/**
 * Media type for reminders
 */
export type ReminderMediaType = 'movie' | 'tv';

/**
 * TV show reminder frequency
 */
export type TVReminderFrequency = 'every_episode' | 'season_premiere';

/**
 * Next episode info for episode-level reminders
 */
export interface NextEpisodeInfo {
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  airDate: string; // ISO 8601 YYYY-MM-DD format
}

/**
 * Reminder document stored in Firestore
 */
export interface Reminder {
  id: string; // Document ID: "movie-{movieId}" or "tv-{tvId}"
  userId: string;
  mediaType: ReminderMediaType;
  mediaId: number; // TMDB movie/TV ID

  // TMDB metadata (cached for sync)
  title: string;
  posterPath: string | null;
  releaseDate: string; // ISO 8601 YYYY-MM-DD format (movie release or TV first air date)

  // User preferences
  reminderTiming: ReminderTiming;

  // Scheduling data
  notificationScheduledFor: number; // UTC timestamp (milliseconds)
  localNotificationId: string | null; // Expo notification identifier

  // Status tracking
  status: 'active' | 'cancelled';
  noNextEpisodeFound?: boolean; // True when auto-update checked but found no upcoming episode
  createdAt: number; // UTC timestamp
  updatedAt: number; // UTC timestamp

  // TV show specific fields (optional, only for mediaType === 'tv')
  tvFrequency?: TVReminderFrequency;
  nextEpisode?: NextEpisodeInfo; // For episode reminders: the upcoming episode we're reminding for
}

/**
 * Base fields shared by all reminder inputs
 */
interface CreateReminderInputBase {
  mediaId: number;
  title: string;
  posterPath: string | null;
  releaseDate: string;
  reminderTiming: ReminderTiming;
}

/**
 * Input for creating a movie reminder
 */
interface CreateMovieReminderInput extends CreateReminderInputBase {
  mediaType: 'movie';
}

/**
 * Input for creating a TV episode reminder (every_episode frequency)
 * - nextEpisode is required for episode-level reminders
 */
interface CreateTVEpisodeReminderInput extends CreateReminderInputBase {
  mediaType: 'tv';
  tvFrequency: 'every_episode';
  nextEpisode: NextEpisodeInfo;
}

/**
 * Input for creating a TV season premiere reminder (season_premiere frequency)
 * - nextEpisode is optional for season premiere reminders
 */
interface CreateTVSeasonReminderInput extends CreateReminderInputBase {
  mediaType: 'tv';
  tvFrequency: 'season_premiere';
  nextEpisode?: NextEpisodeInfo;
}

/**
 * Discriminated union for creating reminders
 * - Movie reminders: only base fields required
 * - TV episode reminders: tvFrequency='every_episode' and nextEpisode required
 * - TV season reminders: tvFrequency='season_premiere' and nextEpisode optional
 */
export type CreateReminderInput =
  | CreateMovieReminderInput
  | CreateTVEpisodeReminderInput
  | CreateTVSeasonReminderInput;

/**
 * Input for updating reminder timing
 */
export interface UpdateReminderInput {
  reminderId: string;
  reminderTiming: ReminderTiming;
}
