import {
  Bookmark02Icon,
  Cancel01Icon,
  CircleIcon,
  FavouriteIcon,
  Folder01Icon,
  PlayIcon,
} from '@hugeicons/core-free-icons';

/**
 * Centralized configuration for list indicator icons and colors.
 * Used by ListMembershipBadge, InlineListIndicators, and other indicator components.
 */

import type { IconSvgElement } from '@hugeicons/react-native';

// Icon data type for reuse
export type ListIconComponent = IconSvgElement;

export interface ListIndicatorConfig {
  icon: ListIconComponent;
  color: string;
}

// Default list icons and colors
export const LIST_INDICATOR_CONFIG: Record<string, ListIndicatorConfig> = {
  watchlist: { icon: Bookmark02Icon, color: '#3B82F6' }, // Blue
  'currently-watching': { icon: PlayIcon, color: '#F97316' }, // Orange - PlayIcon icon
  'already-watched': { icon: CircleIcon, color: '#22C55E' }, // Green - Dot/CircleIcon icon
  favorites: { icon: FavouriteIcon, color: '#EF4444' }, // Red
  dropped: { icon: Cancel01Icon, color: '#6B7280' }, // Gray
  custom: { icon: Folder01Icon, color: '#8B5CF6' }, // Purple - user-defined custom list
};

// Individual color exports for direct use
export const LIST_INDICATOR_COLORS = {
  watchlist: '#3B82F6', // Blue
  currentlyWatching: '#F97316', // Orange
  alreadyWatched: '#22C55E', // Green
  favorites: '#EF4444', // Red
  dropped: '#6B7280', // Gray
} as const;

// Default lists to show (in display order)
export const DEFAULT_LIST_IDS = [
  'watchlist',
  'currently-watching',
  'already-watched',
  'favorites',
  'dropped',
] as const;

export const CUSTOM_LIST_INDICATOR_ID = 'custom' as const;

/**
 * Get the icon configuration for a list ID
 */
export const getListIndicatorConfig = (listId: string): ListIndicatorConfig | null => {
  return LIST_INDICATOR_CONFIG[listId] || null;
};
