import AddToListModal from '@/src/components/AddToListModal';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import Toast from '@/src/components/ui/Toast';
import { DEFAULT_LIST_IDS } from '@/src/constants/lists';
import { ACTIVE_OPACITY, COLORS, HIT_SLOP, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, Heart } from 'lucide-react-native';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function FavoritesScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: lists, isLoading } = useLists();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const mediaGridRef = useRef<MediaGridRef>(null);

  const {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItem,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={() => setSortModalVisible(true)}
          activeOpacity={ACTIVE_OPACITY}
          style={styles.headerButton}
          accessibilityLabel="Sort items"
          accessibilityRole="button"
          hitSlop={HIT_SLOP.m}
        >
          <ArrowUpDown size={22} color={COLORS.text} />
          {hasActiveSort && <View style={styles.sortBadge} />}
        </TouchableOpacity>
      ),
    });
  }, [navigation, hasActiveSort]);

  const favoritesList = useMemo(() => {
    return lists?.find((l) => l.id === DEFAULT_LIST_IDS[3]);
  }, [lists]);

  const listItems = useMemo(() => {
    if (!favoritesList?.items) return [];
    const items = Object.values(favoritesList.items);

    return [...items].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'recentlyAdded':
          return (a.addedAt - b.addedAt) * direction;
        case 'releaseDate': {
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          return dateA.localeCompare(dateB) * direction;
        }
        case 'rating':
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
        case 'alphabetical': {
          const titleA = (a.title || a.name || '').toLowerCase();
          const titleB = (b.title || b.name || '').toLowerCase();
          return titleA.localeCompare(titleB) * direction;
        }
        default:
          return 0;
      }
    });
  }, [favoritesList, sortState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

  // Track if initial mount to avoid scrolling on first render
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Use setTimeout to allow FlashList to finish re-rendering
    const timeoutId = setTimeout(() => {
      mediaGridRef.current?.scrollToTop();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [sortState]);

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <View style={styles.content}>
          <MediaGrid
            ref={mediaGridRef}
            items={listItems}
            isLoading={isLoading}
            emptyState={{
              icon: Heart,
              title: 'No Favorites Yet',
              description: 'Mark movies and TV shows as favorites to see them here.',
              actionLabel: 'Browse Content',
              onAction: () => router.push('/(tabs)/discover' as any),
            }}
            onItemPress={handleItemPress}
            onItemLongPress={handleLongPress}
          />
        </View>
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
        sortState={sortState}
        onApplySort={handleApplySort}
      />

      <Toast ref={toastRef} />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  content: {
    flex: 1,
    paddingTop: SPACING.m,
  },
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
