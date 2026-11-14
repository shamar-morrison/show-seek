import { reserveNonCriticalReadBudget } from '@/src/services/ReadBudgetGuard';
import { listService, type ListItemRatingUpdate, type UserList } from '@/src/services/ListService';
import {
  applySavedListRatings,
  type ListRatingTarget,
  type SavedListRatings,
} from '@/src/utils/listItemRatings';
import type { QueryClient } from '@tanstack/react-query';

/** A saved list entry and the fresh TMDB rating to save onto it. */
export interface ListRatingSave {
  target: ListRatingTarget;
  rating: number;
}

/** The ratings to save into one list document or overflow page. */
interface DocumentRatings {
  listId: string;
  page: number;
  ratings: Record<string, ListItemRatingUpdate>;
  /** Stored key → the entry's key in the cached list. */
  itemKeys: Record<string, string>;
}

export const LIST_RATING_REFRESH_FEATURE = 'list-rating-refresh';

const groupByDocument = (saves: ListRatingSave[]): DocumentRatings[] => {
  const documents = new Map<string, DocumentRatings>();
  saves.forEach(({ target, rating }) => {
    const documentKey = `${target.listId}/${target.page}`;
    const document = documents.get(documentKey) ?? {
      listId: target.listId,
      page: target.page,
      ratings: {},
      itemKeys: {},
    };
    document.ratings[target.storedKey] = {
      mediaType: target.mediaType,
      mediaId: target.mediaId,
      rating,
    };
    document.itemKeys[target.storedKey] = target.itemKey;
    documents.set(documentKey, document);
  });
  return [...documents.values()];
};

/**
 * Saves fresh TMDB ratings onto list entries: one transaction per list document or overflow
 * page (1 read, and 1 write if a rating changed), then brings the cached lists in step so
 * nothing is read again. The reads count against the session's non-critical read budget; when
 * it is spent, nothing is saved. If an entry turned out to be gone, the cached lists are out of
 * date and are reloaded. Failures are logged, never thrown: a rating refresh is never worth an
 * error.
 *
 * @returns Whether the ratings were sent to be saved (false when the read budget is spent).
 */
export async function saveListRatings(
  queryClient: QueryClient,
  userId: string,
  saves: ListRatingSave[]
): Promise<boolean> {
  const documents = groupByDocument(saves);
  if (documents.length === 0) {
    return true;
  }
  if (!reserveNonCriticalReadBudget(LIST_RATING_REFRESH_FEATURE, documents.length)) {
    return false;
  }

  const results = await Promise.all(
    documents.map(async (document) => {
      try {
        const result = await listService.updateListItemRatings(
          document.listId,
          document.page,
          document.ratings
        );
        return { document, result };
      } catch (error) {
        console.warn('[ListRatingRefresh] Saving ratings failed:', error);
        return null;
      }
    })
  );

  const saved: SavedListRatings = new Map();
  let isCacheStale = false;
  results.forEach((outcome) => {
    if (!outcome) return;
    const { document, result } = outcome;
    // Entries saved now, and entries already showing the fresh rating, take it in the cache.
    [...result.updated, ...result.current].forEach((storedKey) => {
      const listRatings = saved.get(document.listId) ?? new Map<string, number>();
      listRatings.set(document.itemKeys[storedKey], document.ratings[storedKey].rating);
      saved.set(document.listId, listRatings);
    });
    if (result.missing.length > 0) {
      isCacheStale = true;
    }
  });

  const queryKey = ['lists', userId];
  if (saved.size > 0) {
    queryClient.setQueryData<UserList[]>(queryKey, (lists) => applySavedListRatings(lists, saved));
  }
  if (isCacheStale) {
    void queryClient.invalidateQueries({ queryKey });
  }
  return true;
}
