import {
  AVAILABLE_TMDB_LISTS,
  DEFAULT_HOME_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '../constants/homeScreenLists';
import { WATCH_STATUS_LISTS } from '../constants/lists';
import { UserList } from '../services/ListService';
import { HomeScreenListItem } from '../types/preferences';

export type HomeScreenCustomListOption = Pick<UserList, 'id' | 'name'>;

const AVAILABLE_TMDB_LIST_IDS = new Set<string>(AVAILABLE_TMDB_LISTS.map((list) => list.id));
const WATCH_STATUS_LIST_IDS = new Set<string>(WATCH_STATUS_LISTS.map((list) => list.id));

const cloneDefaultHomeScreenLists = (): HomeScreenListItem[] =>
  DEFAULT_HOME_LISTS.map((item) => ({ ...item }));

export function normalizeHomeScreenSelections(
  selections: HomeScreenListItem[] | undefined,
  customLists: HomeScreenCustomListOption[]
): HomeScreenListItem[] {
  if (!selections?.length) {
    return cloneDefaultHomeScreenLists();
  }

  const customListLabels = new Map(customLists.map((list) => [list.id, list.name]));
  const normalized: HomeScreenListItem[] = [];
  const seenIds = new Set<string>();

  selections.forEach((item) => {
    if (!item || seenIds.has(item.id)) {
      return;
    }

    if (item.type === 'tmdb') {
      if (!AVAILABLE_TMDB_LIST_IDS.has(item.id)) {
        return;
      }

      normalized.push({ ...item });
      seenIds.add(item.id);
      return;
    }

    if (item.type === 'default') {
      if (!WATCH_STATUS_LIST_IDS.has(item.id)) {
        return;
      }

      normalized.push({ ...item });
      seenIds.add(item.id);
      return;
    }

    if (item.type === 'custom') {
      const label = customListLabels.get(item.id);
      if (!label) {
        return;
      }

      normalized.push({
        ...item,
        label,
      });
      seenIds.add(item.id);
    }
  });

  const limitedSelections = normalized.slice(0, MAX_HOME_LISTS);
  if (limitedSelections.length < MIN_HOME_LISTS) {
    return cloneDefaultHomeScreenLists();
  }

  return limitedSelections;
}

export function areHomeScreenSelectionsEqual(
  left: HomeScreenListItem[] | undefined,
  right: HomeScreenListItem[] | undefined
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right || left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other.id &&
      item.type === other.type &&
      item.label === other.label
    );
  });
}
