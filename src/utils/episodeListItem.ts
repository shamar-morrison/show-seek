import type { ListMediaItem } from '@/src/services/ListService';
import { SEASON_TITLE_SEPARATOR } from '@/src/utils/seasonListItem';

/**
 * How an episode entry is shown on a card: the show's name as the title, and its code with its
 * name ("S2E12 · Phoenix") on the line under it. The code alone when the name isn't known yet
 * (e.g. an entry synced from Trakt before it was filled in).
 */
export const getEpisodeEntryDisplay = (
  item: Partial<
    Pick<
      ListMediaItem,
      'show_name' | 'title' | 'name' | 'season_number' | 'episode_number' | 'episode_name'
    >
  >,
  formatEpisodeCode: (seasonNumber: number, episodeNumber: number) => string
): { title: string; episodeLabel: string } => {
  const showTitle = item.show_name || item.title || item.name || '';
  const code = formatEpisodeCode(item.season_number ?? 0, item.episode_number ?? 0);
  const episodeName = item.episode_name?.trim();
  return {
    title: showTitle,
    episodeLabel: episodeName ? `${code}${SEASON_TITLE_SEPARATOR}${episodeName}` : code,
  };
};
