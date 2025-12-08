import { NextEpisodeInfo, ReminderTiming } from '@/src/types/reminder';
import { parseTmdbDate } from './dateUtils';

/**
 * Compare two NextEpisodeInfo objects to detect if episode data has changed.
 * Used to determine if a reminder needs to be recreated when the upcoming
 * episode information differs from what's stored in the existing reminder.
 */
export function hasEpisodeChanged(
  current: NextEpisodeInfo | null | undefined,
  latest: NextEpisodeInfo | null
): boolean {
  // If neither exists, no change
  if (!current && !latest) return false;
  // If one exists and the other doesn't, there's a change
  if (!current || !latest) return true;
  // Compare all fields
  return (
    current.seasonNumber !== latest.seasonNumber ||
    current.episodeNumber !== latest.episodeNumber ||
    current.airDate !== latest.airDate
  );
}

/**
 * Check if the release date is today (local time).
 * Used to provide context-aware messaging when the episode/season airs today
 * but all notification timing options have already passed.
 *
 * @param releaseDate - Release date in YYYY-MM-DD format
 * @returns true if the release date is today
 */
export function isReleaseToday(releaseDate: string): boolean {
  if (__DEV__) return false; // Allow all options in dev mode

  const release = parseTmdbDate(releaseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  release.setHours(0, 0, 0, 0);
  return release.getTime() === today.getTime();
}

/**
 * Calculate the notification timestamp for a given release date and timing preference.
 * Notifications are scheduled for 9 AM EST (14:00 UTC).
 *
 * @param releaseDate - Release date in YYYY-MM-DD format
 * @param timing - User's reminder timing preference
 * @returns Notification timestamp in milliseconds
 */
export function calculateNotificationTime(releaseDate: string, timing: ReminderTiming): number {
  const release = parseTmdbDate(releaseDate);
  const notificationDate = new Date(release);

  // Apply offset based on timing preference
  if (timing === '1_day_before') {
    notificationDate.setDate(notificationDate.getDate() - 1);
  } else if (timing === '1_week_before') {
    notificationDate.setDate(notificationDate.getDate() - 7);
  }
  // 'on_release_day' uses release date as-is

  // Set to 9 AM EST (14:00 UTC)
  notificationDate.setUTCHours(14, 0, 0, 0);

  return notificationDate.getTime();
}

/**
 * Check if the notification time for a given release date and timing has already passed.
 * Used to disable/warn about timing options that would result in missed notifications.
 *
 * @param releaseDate - Release date in YYYY-MM-DD format
 * @param timing - User's reminder timing preference
 * @returns true if the notification time is in the past
 */
export function isNotificationTimeInPast(releaseDate: string, timing: ReminderTiming): boolean {
  // In DEV mode, allow all options for testing
  if (__DEV__) {
    return false;
  }

  const notificationTime = calculateNotificationTime(releaseDate, timing);
  return notificationTime < Date.now();
}
