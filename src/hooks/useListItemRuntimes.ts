import { useAuth } from '@/src/context/auth';
import type { UserList } from '@/src/services/ListService';
import { resolveListItemRuntimes, type UnstampedListItem } from '@/src/services/WatchTimeBackfill';
import {
  getListItemMediaKey,
  getStoredListItemRuntime,
  getUnstampedListItemRuntimeKey,
} from '@/src/utils/listFilters';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Runtimes found this session, keyed by `getListItemMediaKey`, shared across list screens. */
const sessionRuntimes = new Map<string, number>();
/** Titles already looked up this session (found or not), so they are never looked up twice. */
const attemptedTitles = new Set<string>();

/** For tests: forget runtimes found and titles looked up this session. */
export function resetListItemRuntimesSessionForTests(): void {
  sessionRuntimes.clear();
  attemptedTitles.clear();
}

interface RuntimeLookupState {
  runtimes: Map<string, number>;
  isResolving: boolean;
  done: number;
  total: number;
}

/**
 * Fills in runtimes for a list's items that have none stored, for the runtime filter.
 *
 * Runs only while `enabled`. Missing runtimes come from TMDB (no Firestore reads), are saved
 * back to the items, and are patched into the cached lists so later visits need no lookups.
 */
export function useListItemRuntimes(list: UserList | undefined, enabled: boolean) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const [state, setState] = useState<RuntimeLookupState>(() => ({
    runtimes: new Map(sessionRuntimes),
    isResolving: false,
    done: 0,
    total: 0,
  }));
  /** Only the latest run may update state, so a replaced run can't clear its progress. */
  const runIdRef = useRef(0);

  const missingItems = useMemo<UnstampedListItem[]>(() => {
    if (!list?.items) return [];
    return Object.entries(list.items).flatMap(([itemKey, item]): UnstampedListItem[] => {
      // Skip incomplete entries (no id or type, or a season or episode without its numbers):
      // there is nothing to look up for them.
      if (typeof item?.id !== 'number' || getStoredListItemRuntime(item) !== undefined) {
        return [];
      }
      const mediaType = item.media_type;
      const hasSeason = typeof item.season_number === 'number';
      if (
        mediaType !== 'movie' &&
        mediaType !== 'tv' &&
        !(mediaType === 'season' && hasSeason) &&
        !(mediaType === 'episode' && hasSeason && typeof item.episode_number === 'number')
      ) {
        return [];
      }
      // Cached lists use normalized keys; saves must target the key the item is stored
      // under (legacy items use their numeric id), or they create a stray entry.
      const storedKey = list.storedItemKeys?.[itemKey] ?? itemKey;
      return [
        {
          listId: list.id,
          itemKey: storedKey,
          page: list.overflowItemPages?.[storedKey] ?? 0,
          mediaType,
          mediaId: item.id,
          seasonNumber: item.season_number,
          episodeNumber: item.episode_number,
          addedAt: item.addedAt,
        },
      ];
    });
  }, [list]);

  // Lists cached before stored keys were tracked can't say where legacy items live, so
  // runtimes found for them are only kept in memory until the list is next loaded.
  const canSaveRuntimes = list?.storedItemKeys !== undefined;

  // Changes only when the set of titles still needing a runtime changes.
  const missingSignature = useMemo(
    () =>
      missingItems
        .map((item) => getUnstampedListItemRuntimeKey(item))
        .sort()
        .join(','),
    [missingItems]
  );

  useEffect(() => {
    if (!enabled || !userId || missingItems.length === 0) return;

    const toLookUp = missingItems.filter((item) => {
      const key = getUnstampedListItemRuntimeKey(item);
      return !attemptedTitles.has(key) && !sessionRuntimes.has(key);
    });
    if (toLookUp.length === 0) return;

    const runId = ++runIdRef.current;
    const isLatestRun = () => runIdRef.current === runId;
    const listId = missingItems[0].listId;
    const queryKey = ['lists', userId];
    let cancelled = false;
    const total = new Set(toLookUp.map((item) => getUnstampedListItemRuntimeKey(item))).size;
    setState((prev) => ({ ...prev, isResolving: true, done: 0, total }));

    const rememberFound = (found: Map<string, number>) => {
      found.forEach((minutes, key) => sessionRuntimes.set(key, minutes));
    };

    void resolveListItemRuntimes(toLookUp, {
      ...(canSaveRuntimes ? {} : { stampRuntimes: () => {} }),
      isCancelled: () => cancelled,
      onProgress: ({ done, runtimes }) => {
        rememberFound(runtimes);
        if (!isLatestRun()) return;
        setState((prev) => ({ ...prev, done, runtimes: new Map(sessionRuntimes) }));
      },
    })
      .then((found) => {
        rememberFound(found);
        if (!cancelled) {
          toLookUp.forEach((item) => attemptedTitles.add(getUnstampedListItemRuntimeKey(item)));
        }

        // Keep the cached list in step with the saved runtimes so they survive restarts.
        if (found.size > 0) {
          queryClient.setQueryData<UserList[]>(queryKey, (lists) =>
            lists?.map((cachedList) => {
              if (cachedList.id !== listId) return cachedList;
              let changed = false;
              const items = { ...cachedList.items };
              Object.entries(cachedList.items).forEach(([itemKey, item]) => {
                const minutes = found.get(getListItemMediaKey(item));
                if (minutes !== undefined && getStoredListItemRuntime(item) === undefined) {
                  items[itemKey] =
                    item.media_type === 'season'
                      ? { ...item, runtimeMinutes: minutes, seasonRuntimeMinutes: minutes }
                      : item.media_type === 'episode'
                        ? { ...item, runtimeMinutes: minutes, episodeRuntimeMinutes: minutes }
                        : { ...item, runtimeMinutes: minutes };
                  changed = true;
                }
              });
              return changed ? { ...cachedList, items } : cachedList;
            })
          );
        }
      })
      .catch((error) => {
        console.warn('[useListItemRuntimes] Runtime lookup failed:', error);
      })
      .finally(() => {
        if (!isLatestRun()) return;
        setState((prev) => ({
          ...prev,
          isResolving: false,
          runtimes: new Map(sessionRuntimes),
        }));
      });

    return () => {
      cancelled = true;
    };
    // missingSignature stands in for missingItems so cache patches don't restart the run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, userId, missingSignature, queryClient, canSaveRuntimes]);

  // Every runtime that can be known is known: nothing is waiting for a lookup this session.
  const isComplete = useMemo(
    () =>
      !state.isResolving &&
      missingItems.every((item) => {
        const key = getUnstampedListItemRuntimeKey(item);
        // state.runtimes mirrors the session's found runtimes and changes when a run ends.
        return state.runtimes.has(key) || attemptedTitles.has(key);
      }),
    [missingItems, state.isResolving, state.runtimes]
  );

  return {
    runtimes: state.runtimes,
    isResolving: enabled && state.isResolving,
    isComplete,
    done: state.done,
    total: state.total,
  };
}
