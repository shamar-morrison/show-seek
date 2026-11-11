import {
  BookmarkAdd02Icon,
  CheckListIcon,
  Copy01Icon,
  Delete02Icon,
  DragDropVerticalIcon,
  FilterHorizontalIcon,
  ImageCompositionIcon,
  Search01Icon,
  SlidersHorizontalIcon,
  StarIcon,
  TaskDone01Icon,
  UserSquareIcon,
  UserStar01Icon,
  ViewOffIcon,
  WorkHistoryIcon,
} from '@hugeicons/core-free-icons';
import type { IconSvgElement } from '@hugeicons/react-native';

/**
 * Shortcuts and features that are easy to miss (mostly long presses), shown on Settings >
 * Tips & Features. Each tip's strings are `tips.items.<id>.title` and `.description`.
 * Keep these in step with the features: when a gesture changes, update its tip.
 */
export interface Tip {
  id: string;
  icon: IconSvgElement;
}

export interface TipSection {
  /** Strings under `tips.sections.<id>`. */
  id: string;
  tips: Tip[];
}

export const TIP_SECTIONS: TipSection[] = [
  {
    id: 'titles',
    tips: [
      { id: 'addToList', icon: BookmarkAdd02Icon },
      { id: 'watchHistory', icon: WorkHistoryIcon },
      { id: 'copyTitle', icon: Copy01Icon },
      { id: 'poster', icon: ImageCompositionIcon },
      { id: 'actionButtons', icon: DragDropVerticalIcon },
      { id: 'profileBackground', icon: UserSquareIcon },
    ],
  },
  {
    id: 'people',
    tips: [{ id: 'favoritePeople', icon: UserStar01Icon }],
  },
  {
    id: 'library',
    tips: [
      { id: 'selectSeveral', icon: CheckListIcon },
      { id: 'deleteLists', icon: Delete02Icon },
      { id: 'deleteListWhileAdding', icon: TaskDone01Icon },
      { id: 'hideShows', icon: ViewOffIcon },
      { id: 'removeRatings', icon: StarIcon },
    ],
  },
  {
    id: 'filters',
    tips: [
      { id: 'savedFilters', icon: FilterHorizontalIcon },
      { id: 'filterChips', icon: SlidersHorizontalIcon },
    ],
  },
  {
    id: 'settings',
    tips: [{ id: 'searchSettings', icon: Search01Icon }],
  },
];
