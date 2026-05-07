import type { TVShowDetails } from '@/src/api/tmdb';
import type { NextEpisodeInfo, Reminder } from '@/src/types/reminder';
import { parseTmdbDate } from '@/src/utils/dateUtils';
import { getSubsequentEpisode } from '@/src/utils/subsequentEpisodeHelpers';

const toNextEpisodeInfo = (
  episode: TVShowDetails['next_episode_to_air']
): NextEpisodeInfo | null => {
  if (!episode?.air_date) {
    return null;
  }

  return {
    seasonNumber: episode.season_number,
    episodeNumber: episode.episode_number,
    episodeName: episode.name || 'TBA',
    airDate: episode.air_date,
  };
};

const isLaterThanReminderRelease = (candidate: NextEpisodeInfo, reminder: Reminder): boolean => {
  return parseTmdbDate(candidate.airDate).getTime() > parseTmdbDate(reminder.releaseDate).getTime();
};

/**
 * Resolve the next episode target for a stale every-episode reminder.
 * Prefer TMDB's top-level next_episode_to_air when it has already advanced.
 * If it has not advanced yet, fall back to the subsequent episode lookup so
 * same-day notifications can roll forward immediately when the next episode is known.
 */
export async function resolveTVEpisodeReminderRollover(
  reminder: Reminder,
  showDetails: TVShowDetails
): Promise<NextEpisodeInfo | null> {
  const advancedTmdbEpisode = toNextEpisodeInfo(showDetails.next_episode_to_air);

  if (advancedTmdbEpisode && isLaterThanReminderRelease(advancedTmdbEpisode, reminder)) {
    return advancedTmdbEpisode;
  }

  if (!reminder.nextEpisode) {
    return null;
  }

  const subsequentEpisode = await getSubsequentEpisode(reminder.mediaId, reminder.nextEpisode);
  if (subsequentEpisode && isLaterThanReminderRelease(subsequentEpisode, reminder)) {
    return subsequentEpisode;
  }

  return null;
}
