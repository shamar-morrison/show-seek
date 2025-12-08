import { tmdbApi } from '@/src/api/tmdb';
import { NextEpisodeInfo } from '@/src/types/reminder';

/**
 * Given a TV show ID and the current next episode, find the subsequent episode.
 * Fetches the current season from TMDB and returns the next episode after the given one.
 * If the current episode is the last in its season, checks the next season.
 *
 * This is used when the current "next episode" airs today and all notification
 * times have passed - we can offer to set a reminder for the following episode instead.
 *
 * @param tvId - TMDB TV show ID
 * @param currentEpisode - The episode that's currently "next to air" (airing today)
 * @returns NextEpisodeInfo for the subsequent episode, or null if none found
 */
export async function getSubsequentEpisode(
  tvId: number,
  currentEpisode: NextEpisodeInfo
): Promise<NextEpisodeInfo | null> {
  try {
    // Fetch current season to get all episodes
    const season = await tmdbApi.getSeasonDetails(tvId, currentEpisode.seasonNumber);
    const episodes = season.episodes || [];

    // Find the episode immediately AFTER currentEpisode in the same season
    const nextEpInSeason = episodes.find(
      (ep) =>
        ep.season_number === currentEpisode.seasonNumber &&
        ep.episode_number === currentEpisode.episodeNumber + 1 &&
        ep.air_date // Must have an air date to be useful
    );

    if (nextEpInSeason?.air_date) {
      return {
        seasonNumber: nextEpInSeason.season_number,
        episodeNumber: nextEpInSeason.episode_number,
        episodeName: nextEpInSeason.name || 'TBA',
        airDate: nextEpInSeason.air_date,
      };
    }

    // Current episode is the last in its season - check next season
    const nextSeasonNumber = currentEpisode.seasonNumber + 1;
    try {
      const nextSeason = await tmdbApi.getSeasonDetails(tvId, nextSeasonNumber);
      const firstEpisode = nextSeason.episodes?.find(
        (ep) => ep.episode_number === 1 && ep.air_date
      );

      if (firstEpisode?.air_date) {
        return {
          seasonNumber: firstEpisode.season_number,
          episodeNumber: firstEpisode.episode_number,
          episodeName: firstEpisode.name || 'TBA',
          airDate: firstEpisode.air_date,
        };
      }
    } catch {
      // Next season doesn't exist yet - that's fine, return null
    }

    return null;
  } catch (error) {
    console.error('[getSubsequentEpisode] Error fetching subsequent episode:', error);
    return null;
  }
}
