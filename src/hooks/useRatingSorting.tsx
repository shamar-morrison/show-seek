import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useIconBadgeStyles } from '@/src/styles/iconBadgeStyles';
import { useNavigation } from 'expo-router';
import { ArrowUpDown } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

interface SortableMedia {
  vote_average?: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
}

interface RatingItem {
  rating: {
    ratedAt: number;
    rating: number;
  };
}

/**
 * Creates a comparator function for sorting rating items.
 * Works with both movies and TV shows by using a getter function to extract media properties.
 *
 * @param getMedia - Function to extract the media object from a rating item
 * @param sortState - Current sort state (option and direction)
 * @returns A comparator function for use with Array.sort()
 */
export function createRatingSorter<T extends RatingItem>(
  getMedia: (item: T) => SortableMedia | null | undefined,
  sortState: SortState
): (a: T, b: T) => number {
  return (a: T, b: T): number => {
    const direction = sortState.direction === 'asc' ? 1 : -1;
    const mediaA = getMedia(a);
    const mediaB = getMedia(b);

    switch (sortState.option) {
      case 'recentlyAdded':
        return (a.rating.ratedAt - b.rating.ratedAt) * direction;
      case 'releaseDate': {
        const dateA = mediaA?.release_date || mediaA?.first_air_date || '';
        const dateB = mediaB?.release_date || mediaB?.first_air_date || '';
        return dateA.localeCompare(dateB) * direction;
      }
      case 'rating':
        return ((mediaA?.vote_average ?? 0) - (mediaB?.vote_average ?? 0)) * direction;
      case 'userRating':
        return (a.rating.rating - b.rating.rating) * direction;
      case 'alphabetical': {
        const titleA = (mediaA?.title || mediaA?.name || '').toLowerCase();
        const titleB = (mediaB?.title || mediaB?.name || '').toLowerCase();
        return titleA.localeCompare(titleB) * direction;
      }
      default:
        return 0;
    }
  };
}

interface UseRatingSortingOptions {
  initialSortState?: SortState;
}

interface ScrollableListRef {
  scrollToOffset: (params: { offset: number; animated?: boolean }) => void;
}

interface UseRatingSortingReturn {
  sortState: SortState;
  sortModalVisible: boolean;
  setSortModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  handleApplySort: (newSortState: SortState) => void;
  listRef: React.RefObject<ScrollableListRef | null>;
  hasActiveSort: boolean;
}

/**
 * Custom hook for managing rating list sorting logic.
 * Handles sort state, header button setup, and scroll-to-top on sort change.
 */
export function useRatingSorting(options: UseRatingSortingOptions = {}): UseRatingSortingReturn {
  const { initialSortState = DEFAULT_SORT_STATE } = options;
  const navigation = useNavigation();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(initialSortState);
  const listRef = useRef<ScrollableListRef | null>(null);
  const iconBadgeStyles = useIconBadgeStyles();

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <HeaderIconButton
          onPress={() => setSortModalVisible(true)}
          style={sortHeaderStyles.headerButton}
        >
          <View style={iconBadgeStyles.wrapper}>
            <ArrowUpDown size={22} color={COLORS.text} />
            {hasActiveSort && <View style={iconBadgeStyles.badge} />}
          </View>
        </HeaderIconButton>
      ),
    });
  }, [navigation, hasActiveSort, iconBadgeStyles]);

  // Track if initial mount to avoid scrolling on first render
  const isInitialMount = useRef(true);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

  // Scroll to top after sort state changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Use setTimeout to allow FlashList to finish re-rendering
    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [sortState]);

  return {
    sortState,
    sortModalVisible,
    setSortModalVisible,
    handleApplySort,
    listRef,
    hasActiveSort,
  };
}

export const sortHeaderStyles = StyleSheet.create({
  headerButton: {
    marginRight: SPACING.s,
  },
});
