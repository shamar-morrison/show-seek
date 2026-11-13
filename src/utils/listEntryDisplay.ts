import type { ListMediaItem } from '@/src/services/ListService';
import { getEpisodeEntryDisplay } from '@/src/utils/episodeListItem';
import { getSeasonEntryDisplay } from '@/src/utils/seasonListItem';
import type { TFunction } from 'i18next';

export interface ListEntryDisplay {
  /** The show's name. */
  title: string;
  /** The line under it: "Season 2", "Specials", or "S2E12 · Phoenix". */
  label: string;
}

/**
 * Card text for an entry that stands for part of a show (a season or an episode): the show's
 * name, then which part. Null for movies and shows, which use their own title, year and rating.
 */
export const getListEntryDisplay = (
  item: Partial<
    Pick<
      ListMediaItem,
      | 'media_type'
      | 'show_name'
      | 'title'
      | 'name'
      | 'season_number'
      | 'season_name'
      | 'episode_number'
      | 'episode_name'
    >
  >,
  t: TFunction
): ListEntryDisplay | null => {
  if (item.media_type === 'season') {
    const { title, seasonLabel } = getSeasonEntryDisplay(item, (number) =>
      t('media.seasonNumber', { number })
    );
    return { title, label: seasonLabel };
  }
  if (item.media_type === 'episode') {
    const { title, episodeLabel } = getEpisodeEntryDisplay(item, (season, episode) =>
      t('media.seasonEpisode', { season, episode })
    );
    return { title, label: episodeLabel };
  }
  return null;
};
