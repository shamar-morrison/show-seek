import type { ListMediaItem } from '@/src/services/ListService';
import { isEpisodeListItemRef, isSeasonListItemRef } from '@/src/utils/listItemKeys';

/**
 * The screen a list entry opens, under `basePath` (e.g. `/(tabs)/library`). Movies open their
 * detail screen, shows theirs, a season opens the show's seasons screen at that season, and an
 * episode opens its own screen.
 */
export const getListItemRoute = (
  basePath: string,
  item: Pick<ListMediaItem, 'id' | 'media_type' | 'season_number' | 'episode_number'>
): string => {
  if (item.media_type === 'movie') {
    return `${basePath}/movie/${item.id}`;
  }
  if (item.media_type === 'episode') {
    return isEpisodeListItemRef(item)
      ? `${basePath}/tv/${item.id}/season/${item.season_number}/episode/${item.episode_number}`
      : `${basePath}/tv/${item.id}/seasons`;
  }
  if (item.media_type === 'season') {
    return isSeasonListItemRef(item)
      ? `${basePath}/tv/${item.id}/seasons?season=${item.season_number}`
      : `${basePath}/tv/${item.id}/seasons`;
  }
  return `${basePath}/tv/${item.id}`;
};
