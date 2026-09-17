import type { Episode } from '@/src/api/tmdb';
import { hasEpisodeAired } from '@/src/utils/dateUtils';

/**
 * Filter episodes down to those eligible to be marked as watched.
 *
 * Episodes without an air date are never markable. Unaired (future-dated)
 * episodes are only markable when the `allowUnreleasedEpisodeWatches`
 * preference is enabled.
 *
 * @param episodes - Full episode list (e.g. for a season)
 * @param allowUnreleasedEpisodeWatches - Value of the `allowUnreleasedEpisodeWatches` preference
 * @returns Episodes eligible to be marked as watched
 */
export function getMarkableEpisodes(
  episodes: Episode[],
  allowUnreleasedEpisodeWatches: boolean
): Episode[] {
  return episodes.filter(
    (episode) =>
      !!episode.air_date &&
      (allowUnreleasedEpisodeWatches || hasEpisodeAired(episode.air_date))
  );
}
