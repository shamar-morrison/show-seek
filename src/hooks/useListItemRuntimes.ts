import { useAuth } from '@/src/context/auth';
import type { UserList } from '@/src/services/ListService';
import { resolveListItemRuntimes, type UnstampedListItem } from '@/src/services/WatchTimeBackfill';
import { getMediaKey } from '@/src/utils/listFilters';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Runtimes found this session, keyed by `${mediaType}:${id}`, shared across list screens. */
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

const hasRuntime = (minutes: number | undefined) => minutes != null && minutes > 0;

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
    return Object.entries(list.items)
      .filter(([, item]) => !hasRuntime(item.runtimeMinutes))
      .map(([itemKey, item]) => ({
        listId: list.id,
        itemKey,
        page: list.overflowItemPages?.[itemKey] ?? 0,
        mediaType: item.media_type,
        mediaId: item.id,
        addedAt: item.addedAt,
      }));
  }, [list]);

  // Changes only when the set of titles still needing a runtime changes.
  const missingSignature = useMemo(
    () =>
      missingItems
        .map((item) => getMediaKey(item.mediaType, item.mediaId))
        .sort()
        .join(','),
    [missingItems]
  );

  useEffect(() => {
    if (!enabled || !userId || missingItems.length === 0) return;

    const toLookUp = missingItems.filter((item) => {
      const key = getMediaKey(item.mediaType, item.mediaId);
      return !attemptedTitles.has(key) && !sessionRuntimes.has(key);
    });
    if (toLookUp.length === 0) return;

    const runId = ++runIdRef.current;
    const isLatestRun = () => runIdRef.current === runId;
    const listId = missingItems[0].listId;
    const queryKey = ['lists', userId];
    let cancelled = false;
    const total = new Set(toLookUp.map((item) => getMediaKey(item.mediaType, item.mediaId))).size;
    setState((prev) => ({ ...prev, isResolving: true, done: 0, total }));

    const rememberFound = (found: Map<string, number>) => {
      found.forEach((minutes, key) => sessionRuntimes.set(key, minutes));
    };

    void resolveListItemRuntimes(toLookUp, {
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
          toLookUp.forEach((item) =>
            attemptedTitles.add(getMediaKey(item.mediaType, item.mediaId))
          );
        }

        // Keep the cached list in step with the saved runtimes so they survive restarts.
        if (found.size > 0) {
          queryClient.setQueryData<UserList[]>(queryKey, (lists) =>
            lists?.map((cachedList) => {
              if (cachedList.id !== listId) return cachedList;
              let changed = false;
              const items = { ...cachedList.items };
              Object.entries(cachedList.items).forEach(([itemKey, item]) => {
                const minutes = found.get(getMediaKey(item.media_type, item.id));
                if (minutes !== undefined && !hasRuntime(item.runtimeMinutes)) {
                  items[itemKey] = { ...item, runtimeMinutes: minutes };
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
  }, [enabled, userId, missingSignature, queryClient]);

  return {
    runtimes: state.runtimes,
    isResolving: enabled && state.isResolving,
    done: state.done,
    total: state.total,
  };
}
