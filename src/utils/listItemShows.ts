import type { ListMediaItem } from '@/src/services/ListService';

/**
 * A list's entries with each season counted as its show, for features that work per show
 * (calendar, upcoming releases, where to watch). A show appears once however many of its
 * seasons are listed; when the show itself is listed, that entry is kept as is.
 */
export function collapseSeasonsToShows<T extends ListMediaItem>(items: T[]): T[] {
  const listedShowIds = new Set(
    items.filter((item) => item.media_type === 'tv').map((item) => item.id)
  );
  const seasonShowIds = new Set<number>();
  const result: T[] = [];

  items.forEach((item) => {
    if (item.media_type !== 'season') {
      result.push(item);
      return;
    }
    if (listedShowIds.has(item.id) || seasonShowIds.has(item.id)) {
      return;
    }
    seasonShowIds.add(item.id);
    const showName = item.show_name || item.title || item.name || '';
    result.push({
      ...item,
      media_type: 'tv',
      title: showName,
      name: showName,
      season_number: undefined,
      season_name: undefined,
      // The season's air date and runtime aren't the show's.
      release_date: '',
      first_air_date: '',
      runtimeMinutes: undefined,
      seasonRuntimeMinutes: undefined,
    });
  });

  return result;
}
