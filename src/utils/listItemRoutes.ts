import type { ListMediaItem } from '@/src/services/ListService';
import { isSeasonListItemRef } from '@/src/utils/listItemKeys';

/**
 * The screen a list entry opens, under `basePath` (e.g. `/(tabs)/library`). Movies open their
 * detail screen, shows theirs, and a season opens the show's seasons screen at that season.
 */
export const getListItemRoute = (
  basePath: string,
  item: Pick<ListMediaItem, 'id' | 'media_type' | 'season_number'>
): string => {
  if (item.media_type === 'movie') {
    return `${basePath}/movie/${item.id}`;
  }
  if (item.media_type === 'season') {
    return isSeasonListItemRef(item)
      ? `${basePath}/tv/${item.id}/seasons?season=${item.season_number}`
      : `${basePath}/tv/${item.id}/seasons`;
  }
  return `${basePath}/tv/${item.id}`;
};
