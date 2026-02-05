import { UserList } from '@/src/services/ListService';

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
