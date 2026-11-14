import type { ListMediaItem } from '@/src/services/ListService';
import { getEpisodeEntryDisplay } from '@/src/utils/episodeListItem';
import { getSeasonEntryDisplay, SEASON_TITLE_SEPARATOR } from '@/src/utils/seasonListItem';
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

/**
 * One line naming an entry, to confirm what's being added: the title for a movie or a show,
 * "Season 2 · Show" for a season, and "S2E5 · Show" for an episode. The part comes first so it
 * stays visible when a long show name is cut off.
 */
export const getListEntrySummary = (
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
    >
  >,
  t: TFunction
): string => {
  const ownTitle = item.title || item.name || '';
  const showName = item.show_name?.trim();
  // Entries saved without the show's name only have the combined title ("Show · Season 2"),
  // which already says which part it is.
  if ((item.media_type !== 'season' && item.media_type !== 'episode') || !showName) {
    return ownTitle;
  }

  const part =
    item.media_type === 'season'
      ? getSeasonEntryDisplay(item, (number) => t('media.seasonNumber', { number })).seasonLabel
      : t('media.seasonEpisode', {
          season: item.season_number ?? 0,
          episode: item.episode_number ?? 0,
        });
  return `${part}${SEASON_TITLE_SEPARATOR}${showName}`;
};
