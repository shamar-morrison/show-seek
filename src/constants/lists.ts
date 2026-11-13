import type { ListMediaItem, UserList } from '@/src/services/ListService';

/**
 * Premium limits for free users
 */
export const MAX_FREE_LISTS = 5;
export const MAX_FREE_ITEMS_PER_LIST = 50;

/**
 * Default list IDs that cannot be deleted
 */
export const DEFAULT_LIST_IDS = [
  'watchlist',
  'currently-watching',
  'already-watched',
  'favorites',
  'dropped',
] as const;

/**
 * Type for default list IDs
 */
export type DefaultListId = (typeof DEFAULT_LIST_IDS)[number];

/**
 * Check if a list ID is a default list
 */
export const isDefaultList = (listId: string): boolean => {
  return DEFAULT_LIST_IDS.includes(listId as DefaultListId);
};

/**
 * Whether a list can take an entry of this type. An episode can go in Should Watch and custom
 * lists only: watched, watching, favorite and dropped are already covered for episodes by
 * episode tracking and Favorite Episodes, or only make sense for a whole show. Every import
 * that brings episodes (Trakt, IMDb) puts them in Should Watch or custom lists.
 */
export const canListHoldEntry = (listId: string, mediaType: ListMediaItem['media_type']): boolean =>
  mediaType !== 'episode' || listId === 'watchlist' || !isDefaultList(listId);

/**
 * Filter out default lists to get only custom lists
 */
export const filterCustomLists = (lists: UserList[]): UserList[] => {
  return lists.filter((l) => !isDefaultList(l.id));
};

/**
 * Filter to get only default watch status lists
 */
export const filterWatchStatusLists = (lists: UserList[]): UserList[] => {
  return lists.filter((l) => isDefaultList(l.id));
};

/**
 * Map of list IDs to their display names and order
 */
export const WATCH_STATUS_LISTS = [
  { id: 'watchlist', labelKey: 'lists.shouldWatch' },
  { id: 'currently-watching', labelKey: 'lists.watching' },
  { id: 'already-watched', labelKey: 'lists.alreadyWatched' },
  { id: 'favorites', labelKey: 'lists.favorites' },
  { id: 'dropped', labelKey: 'lists.dropped' },
] as const;
