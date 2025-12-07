import { NextEpisodeInfo } from '@/src/types/reminder';

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
