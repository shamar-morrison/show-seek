import { Bookmark, Circle, Folder, Heart, Play, X } from 'lucide-react-native';

/**
 * Centralized configuration for list indicator icons and colors.
 * Used by ListMembershipBadge, InlineListIndicators, and other indicator components.
 */

// Icon component type for reuse
export type ListIconComponent = React.ComponentType<{
  size: number;
  color: string;
  fill?: string;
}>;

export interface ListIndicatorConfig {
  icon: ListIconComponent;
  color: string;
}

// Default list icons and colors
export const LIST_INDICATOR_CONFIG: Record<string, ListIndicatorConfig> = {
  watchlist: { icon: Bookmark, color: '#3B82F6' }, // Blue
  'currently-watching': { icon: Play, color: '#F97316' }, // Orange - Play icon
  'already-watched': { icon: Circle, color: '#22C55E' }, // Green - Dot/Circle icon
  favorites: { icon: Heart, color: '#EF4444' }, // Red
  dropped: { icon: X, color: '#6B7280' }, // Gray
  custom: { icon: Folder, color: '#8B5CF6' }, // Purple - user-defined custom list
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
