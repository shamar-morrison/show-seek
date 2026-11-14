import { tmdbApi } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { saveListRatings } from '@/src/services/ListRatingRefresh';
import type { UserList } from '@/src/services/ListService';
import { isAbortError } from '@/src/services/WatchTimeBackfill';
import {
  getFreshRating,
  getListRatingCandidates,
  getListRatingUpdate,
  LIST_RATING_CHECK_INTERVAL_MS,
  rememberFreshRating,
  type ListRatingTarget,
} from '@/src/utils/listItemRatings';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

/** Titles looked up at once, and the pause between batches, to stay well inside TMDB's limits. */
export const LIST_RATING_LOOKUP_BATCH_SIZE = 5;
export const LIST_RATING_LOOKUP_BATCH_GAP_MS = 250;

const CHECKED_AT_STORAGE_PREFIX = 'listRatingsCheckedAt';

/** Lists checked (or being checked) this session, so a list is checked at most once per session. */
const checkedThisSession = new Set<string>();

/** For tests: forget which lists were checked this session. */
export function resetListRatingChecksForTests(): void {
  checkedThisSession.clear();
}

const getCheckedAtKey = (userId: string, listId: string) =>
  `${CHECKED_AT_STORAGE_PREFIX}:${userId}:${listId}`;

const readCheckedAt = async (key: string): Promise<number | null> => {
  try {
    const value = Number(await AsyncStorage.getItem(key));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
};

const writeCheckedAt = async (key: string, time: number): Promise<void> => {
  try {
    await AsyncStorage.setItem(key, String(time));
  } catch {
    // Not remembered: the list is checked again next session, which costs only TMDB lookups.
  }
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const isNotFound = (error: unknown): boolean =>
  (error as { status?: number } | null)?.status === 404;

/**
 * TMDB's current rating for each candidate, through the same query cache the details pages
 * use, so titles opened recently need no request. Lookups stop early when rate limited or timed
 * out, or when `isCancelled`. A title TMDB no longer has counts as looked up; any other failure
 * (e.g. offline) leaves the check incomplete, so it runs again.
 *
 * @returns The ratings found, and whether every candidate was looked up.
 */
const lookUpRatings = async (
  queryClient: QueryClient,
  candidates: ListRatingTarget[],
  isCancelled: () => boolean
): Promise<{ ratings: Map<ListRatingTarget, number>; complete: boolean }> => {
  const ratings = new Map<ListRatingTarget, number>();
  const toFetch: ListRatingTarget[] = [];
  candidates.forEach((candidate) => {
    const known = getFreshRating(candidate.mediaType, candidate.mediaId);
    if (known !== undefined) {
      ratings.set(candidate, known);
    } else {
      toFetch.push(candidate);
    }
  });

  let complete = true;
  for (let start = 0; start < toFetch.length; start += LIST_RATING_LOOKUP_BATCH_SIZE) {
    if (isCancelled()) {
      return { ratings, complete: false };
    }
    if (start > 0) {
      await sleep(LIST_RATING_LOOKUP_BATCH_GAP_MS);
    }
    let aborted = false;
    await Promise.all(
      toFetch.slice(start, start + LIST_RATING_LOOKUP_BATCH_SIZE).map(async (candidate) => {
        try {
          const details =
            candidate.mediaType === 'movie'
              ? await queryClient.fetchQuery({
                  queryKey: ['movie', candidate.mediaId],
                  queryFn: () => tmdbApi.getMovieDetails(candidate.mediaId),
                })
              : await queryClient.fetchQuery({
                  queryKey: ['tv', candidate.mediaId],
                  queryFn: () => tmdbApi.getTVShowDetails(candidate.mediaId),
                });
          const rating = details?.vote_average;
          if (typeof rating === 'number' && Number.isFinite(rating)) {
            rememberFreshRating(candidate.mediaType, candidate.mediaId, rating);
            ratings.set(candidate, rating);
          }
        } catch (error) {
          if (isAbortError(error)) {
            aborted = true;
          } else if (!isNotFound(error)) {
            complete = false;
          }
        }
      })
    );
    if (aborted) {
      return { ratings, complete: false };
    }
  }
  return { ratings, complete: complete && !isCancelled() };
};

/**
 * Checks a list's recent titles against TMDB and saves the ratings that changed, at most once a
 * day per list (and once per session). New titles' ratings move a lot, while lists show the
 * rating saved when a title was added. Only recent and upcoming titles are looked up, at most
 * `MAX_LIST_RATING_LOOKUPS`, through the details pages' query cache; changed ratings are saved
 * with one transaction per list document (see `saveListRatings`).
 *
 * The day's check is only recorded once it finished, so a check cut short (rate limited,
 * offline, screen left, read budget spent) runs again. Leaving the screen stops new lookups,
 * but ratings already found are still saved.
 */
export function useRefreshListRatings(list: UserList | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const listId = list?.id;
  const hasList = list !== undefined;
  const knowsStoredKeys = list?.storedItemKeys !== undefined;

  useEffect(() => {
    if (!userId || !list) return;
    // A list cached before stored keys were tracked can't say where legacy entries live, so
    // nothing in it can be saved; it is checked once it has been loaded again.
    if (!list.storedItemKeys) return;
    const sessionKey = `${userId}:${list.id}`;
    if (checkedThisSession.has(sessionKey)) return;
    checkedThisSession.add(sessionKey);

    let cancelled = false;
    let finished = false;
    const checkedAtKey = getCheckedAtKey(userId, list.id);

    const check = async () => {
      const now = Date.now();
      const checkedAt = await readCheckedAt(checkedAtKey);
      if (checkedAt !== null && now - checkedAt < LIST_RATING_CHECK_INTERVAL_MS) {
        return true;
      }

      // The list as first shown: later cache updates (including this check's own) don't restart it.
      const candidates = getListRatingCandidates(list, now);
      const { ratings, complete } = await lookUpRatings(queryClient, candidates, () => cancelled);

      const saves = candidates.flatMap((target) => {
        const rating = ratings.get(target);
        return rating !== undefined && getListRatingUpdate(target.storedRating, rating) !== null
          ? [{ target, rating }]
          : [];
      });
      const saved = await saveListRatings(queryClient, userId, saves);

      if (complete && saved) {
        await writeCheckedAt(checkedAtKey, now);
        return true;
      }
      return false;
    };

    void check()
      .then((done) => {
        finished = done;
      })
      .catch((error) => {
        console.warn('[useRefreshListRatings] List rating check failed:', error);
      })
      .finally(() => {
        // Cut short: let the list be checked again this session.
        if (!finished) checkedThisSession.delete(sessionKey);
      });

    return () => {
      cancelled = true;
    };
    // Runs once per list: `list` changes with every cache update, which must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, listId, hasList, knowsStoredKeys, queryClient]);
}
