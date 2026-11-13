import { DEFAULT_ACCENT_COLOR } from '@/src/constants/accentColors';
import { COLORS, hexToRGBA } from '@/src/constants/theme';
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

/**
 * What an add-to-list button shows for an entry held by `listIds`: that list's own icon and
 * color when it's in one list (e.g. the heart in the accent color for Favorites), the
 * multiple-lists icon only when it's in several, and null when it's in none (the button then
 * shows its add icon). Every add-to-list button (movies, shows, seasons, episodes) uses this,
 * so they can't drift apart.
 */
export const getListMembershipIcon = (
  listIds: readonly string[],
  accentColor: string = DEFAULT_ACCENT_COLOR
): { icon: IconSvgElement; color: string } | null => {
  if (listIds.length === 0) return null;
  if (listIds.length === 1) {
    return {
      icon: getListIconComponent(listIds[0]),
      color: getListColor(listIds[0], accentColor),
    };
  }
  return { icon: MultipleListsIcon, color: MULTIPLE_LISTS_COLOR };
};

/**
 * The active background and border of an add-to-list button for an entry in lists: a tint of
 * the color from getListMembershipIcon (the list's own color, or the multiple-lists color), as
 * on movie and show pages. Undefined when the entry is in no list.
 */
export const getListMembershipTint = (
  membershipIcon: { color: string } | null | undefined
): { backgroundColor: string; borderColor: string } | undefined =>
  membershipIcon
    ? {
        backgroundColor: hexToRGBA(membershipIcon.color, 0.15),
        borderColor: hexToRGBA(membershipIcon.color, 0.5),
      }
    : undefined;
