import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { COLORS } from '@/src/constants/theme';
import {
  Bookmark02Icon,
  Cancel01Icon,
  CheckListIcon,
  FavouriteIcon,
  Folder01Icon,
  PlayCircle02Icon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';

/**
 * Get the HugeIcons icon data associated with a list ID.
 */
export const getListIconComponent = (listId: string): IconSvgElement => {
  switch (listId) {
    case 'watchlist':
      return Bookmark02Icon;
    case 'currently-watching':
      return PlayCircle02Icon;
    case 'already-watched':
      return Tick02Icon;
    case 'favorites':
      return FavouriteIcon;
    case 'dropped':
      return Cancel01Icon;
    default:
      return Folder01Icon;
  }
};

/**
 * Get the color associated with a list ID.
 */
export const getListColor = (
  listId: string,
  accentColor: string = DEFAULT_ACCENT_COLOR
): string => {
  switch (listId) {
    case 'watchlist':
      return '#3b82f6'; // Blue
    case 'currently-watching':
      return COLORS.warning; // Orange
    case 'already-watched':
      return COLORS.success; // Green
    case 'favorites':
      return accentColor; // Accent color
    case 'dropped':
      return '#6b7280'; // Gray
    default:
      return '#3b82f6'; // Default purple
  }
};

/**
 * Default icon for items in multiple lists
 */
export const MultipleListsIcon = CheckListIcon;

/**
 * Default color for items in multiple lists
 */
export const MULTIPLE_LISTS_COLOR = COLORS.success;
