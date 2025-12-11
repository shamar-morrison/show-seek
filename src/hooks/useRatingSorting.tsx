import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { ACTIVE_OPACITY, COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useNavigation } from 'expo-router';
import { ArrowUpDown } from 'lucide-react-native';
import React, { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface UseRatingSortingOptions {
  initialSortState?: SortState;
}

interface UseRatingSortingReturn {
  sortState: SortState;
  sortModalVisible: boolean;
  setSortModalVisible: (visible: boolean) => void;
  handleApplySort: (newSortState: SortState) => void;
  listRef: React.RefObject<any>;
  hasActiveSort: boolean;
}

/**
 * Custom hook for managing rating list sorting logic.
 * Handles sort state, header button setup, and scroll-to-top on sort change.
 */
export function useRatingSorting(
  options: UseRatingSortingOptions = {}
): UseRatingSortingReturn {
  const { initialSortState = DEFAULT_SORT_STATE } = options;
  const navigation = useNavigation();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(initialSortState);
  const listRef = useRef<any>(null);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSortModalVisible(true)}
          activeOpacity={ACTIVE_OPACITY}
          style={sortHeaderStyles.headerButton}
          accessibilityLabel="Sort items"
          accessibilityRole="button"
          hitSlop={HIT_SLOP.m}
        >
          <ArrowUpDown size={22} color={COLORS.text} />
          {hasActiveSort && <View style={sortHeaderStyles.sortBadge} />}
        </TouchableOpacity>
      ),
    });
  }, [navigation, hasActiveSort]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    // Scroll to top after sort is applied
    setTimeout(() => {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);
  };

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
    position: 'relative',
    marginRight: SPACING.s,
  },
  sortBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
});
