import { UserList } from '../services/ListService';

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
  { id: 'watchlist', label: 'Should Watch' },
  { id: 'currently-watching', label: 'Watching' },
  { id: 'already-watched', label: 'Already Watched' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'dropped', label: 'Dropped' },
] as const;
