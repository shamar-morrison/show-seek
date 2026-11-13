import type { Episode } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { listService, type ListMediaItem, type UserList } from '@/src/services/ListService';
import { getEpisodeEntryRefresh } from '@/src/utils/episodeListItem';
import { findListItemByRef, getListItemKey, type ListItemRef } from '@/src/utils/listItemKeys';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * When an episode's screen opens, brings its saved list entries up to date with TMDB (name, air
 * date, still, runtime), once per screen. Entries saved before the episode aired otherwise keep
 * a placeholder name and no air date. Writes only the lists whose entry is out of date (never
 * re-creating one removed meanwhile), and updates the cached lists so nothing is read again.
 */
export function useRefreshEpisodeListEntries({
  tvId,
  seasonNumber,
  episodeNumber,
  episode,
  lists,
}: {
  tvId: number;
  seasonNumber: number;
  episodeNumber: number;
  episode:
    | (Pick<Episode, 'name' | 'air_date' | 'still_path'> & { runtime?: number | null })
    | undefined;
  lists: UserList[] | undefined;
}) {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const refreshedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!userId || !episode || !lists) return;
    const ref: ListItemRef = {
      id: tvId,
      media_type: 'episode',
      season_number: seasonNumber,
      episode_number: episodeNumber,
    };
    const itemKey = getListItemKey(ref);
    if (!itemKey || refreshedKeyRef.current === itemKey) return;
    refreshedKeyRef.current = itemKey;

    // This episode's stand-in name in the app's language, which never replaces a real one.
    const localizedPlaceholder = t('media.episodeNumber', { number: episodeNumber });
    const outdated = lists.flatMap((list) => {
      const saved = findListItemByRef(list.items, ref);
      const fields = saved ? getEpisodeEntryRefresh(saved, episode, localizedPlaceholder) : null;
      return fields ? [{ list, fields }] : [];
    });
    if (outdated.length === 0) return;

    void Promise.all(
      outdated.map(async ({ list, fields }) => {
        try {
          const updated = await listService.updateListItemFields(
            list.id,
            ref,
            list.overflowItemPages?.[itemKey] ?? 0,
            fields
          );
          return updated ? { listId: list.id, fields } : { listId: list.id, fields: null };
        } catch (error) {
          console.warn('[useRefreshEpisodeListEntries] Refresh failed:', error);
          return null;
        }
      })
    ).then((results) => {
      const updated = new Map<string, Partial<ListMediaItem>>();
      let isCacheStale = false;
      results.forEach((result) => {
        if (!result) return;
        if (result.fields) updated.set(result.listId, result.fields);
        // The entry is gone from that list, so the cached lists are out of date.
        else isCacheStale = true;
      });
      if (isCacheStale) {
        void queryClient.invalidateQueries({ queryKey: ['lists', userId] });
      }
      if (updated.size === 0) return;
      queryClient.setQueryData<UserList[]>(['lists', userId], (cachedLists) =>
        cachedLists?.map((list) => {
          const fields = updated.get(list.id);
          const saved = list.items?.[itemKey];
          return fields && saved
            ? { ...list, items: { ...list.items, [itemKey]: { ...saved, ...fields } } }
            : list;
        })
      );
    });
  }, [episode, episodeNumber, lists, queryClient, seasonNumber, t, tvId, userId]);
}
