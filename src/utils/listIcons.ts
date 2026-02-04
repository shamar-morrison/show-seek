import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { COLORS } from '@/src/constants/theme';
import {
  Bookmark,
  Check,
  CirclePlay,
  Folder,
  Heart,
  ListCheck,
  LucideIcon,
  X,
} from 'lucide-react-native';

/**
 * Get the Lucide icon component associated with a list ID.
 */
export const getListIconComponent = (listId: string): LucideIcon => {
  switch (listId) {
    case 'watchlist':
      return Bookmark;
    case 'currently-watching':
      return CirclePlay;
    case 'already-watched':
      return Check;
    case 'favorites':
      return Heart;
    case 'dropped':
      return X;
    default:
      return Folder;
  }
};

/**
 * Get the color associated with a list ID.
 */
export const getListColor = (listId: string, accentColor: string = DEFAULT_ACCENT_COLOR): string => {
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
export const MultipleListsIcon = ListCheck;

/**
 * Default color for items in multiple lists
 */
export const MULTIPLE_LISTS_COLOR = COLORS.success;
