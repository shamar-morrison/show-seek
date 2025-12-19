import AddToListModal from '@/src/components/AddToListModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import ListActionsModal, { ListActionsModalRef } from '@/src/components/ListActionsModal';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import Toast from '@/src/components/ui/Toast';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { DEFAULT_LIST_IDS } from '@/src/constants/lists';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { ArrowUpDown, Heart, Settings2, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const VIEW_MODE_STORAGE_KEY = 'favoritesViewMode';

export default function FavoritesScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );
  const mediaGridRef = useRef<MediaGridRef>(null);
  const listRef = useRef<any>(null);
  const listActionsModalRef = useRef<ListActionsModalRef>(null);

  // Fetch genre data for filter modal
  const { data: genreMap = {} } = useAllGenres();

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

  const hasActiveFilterState = hasActiveFilters(filterState);

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: VIEW_MODE_STORAGE_KEY,
    showSortButton: false,
    actionButton: {
      icon: Settings2,
      onPress: () => listActionsModalRef.current?.present(),
      showBadge: hasActiveSort || hasActiveFilterState,
    },
  });

  const favoritesList = useMemo(() => {
    return lists?.find((l) => l.id === DEFAULT_LIST_IDS[3]);
  }, [lists]);

  const listItems = useMemo(() => {
    if (!favoritesList?.items) return [];
    const items = Object.values(favoritesList.items);

    // Apply filters first
    const filteredItems = filterMediaItems(items, filterState);

    // Then apply sorting
    return [...filteredItems].sort((a, b) => {
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
  }, [favoritesList, sortState, filterState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
    setTimeout(() => {
      if (viewMode === 'grid') {
        mediaGridRef.current?.scrollToTop();
      } else {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }
    }, 100);
  };

  const listActions = useMemo(
    () => [
      {
        id: 'filter',
        icon: SlidersHorizontal,
        label: 'Filter Items',
        onPress: () => setFilterModalVisible(true),
        showBadge: hasActiveFilterState,
      },
      {
        id: 'sort',
        icon: ArrowUpDown,
        label: 'Sort Items',
        onPress: () => setSortModalVisible(true),
        showBadge: hasActiveSort,
      },
    ],
    [hasActiveFilterState, hasActiveSort]
  );

  // Track if initial mount to avoid scrolling on first render
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Use setTimeout to allow FlashList to finish re-rendering
    const timeoutId = setTimeout(() => {
      if (viewMode === 'grid') {
        mediaGridRef.current?.scrollToTop();
      } else {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [sortState, filterState, viewMode]);

  const renderListItem = useCallback(
    ({ item }: { item: ListMediaItem }) => (
      <MediaListCard item={item} onPress={handleItemPress} onLongPress={handleLongPress} />
    ),
    [handleItemPress, handleLongPress]
  );

  const keyExtractor = useCallback((item: ListMediaItem) => `${item.id}-${item.media_type}`, []);

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (listItems.length === 0 && !hasActiveFilterState) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Heart}
          title="No Favorites Yet"
          description="Mark movies and TV shows as favorites to see them here."
          actionLabel="Browse Content"
          onAction={() => router.push('/(tabs)/discover' as any)}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <View style={styles.content}>
          {viewMode === 'grid' ? (
            <MediaGrid
              key="grid"
              ref={mediaGridRef}
              items={listItems}
              isLoading={isLoading}
              emptyState={
                hasActiveFilterState
                  ? {
                      icon: SlidersHorizontal,
                      title: 'No items match your filters',
                      description: 'Try adjusting your filters to see more results.',
                      actionLabel: 'Clear Filters',
                      onAction: () => setFilterState(DEFAULT_WATCH_STATUS_FILTERS),
                    }
                  : {
                      icon: Heart,
                      title: 'No Favorites Yet',
                      description: 'Mark movies and TV shows as favorites to see them here.',
                      actionLabel: 'Browse Content',
                      onAction: () => router.push('/(tabs)/discover' as any),
                    }
              }
              onItemPress={handleItemPress}
              onItemLongPress={handleLongPress}
            />
          ) : (
            <FlashList
              key="list"
              ref={listRef}
              data={listItems}
              renderItem={renderListItem}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
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

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filterState}
        onApplyFilters={(newFilters) => {
          setFilterState(newFilters);
          setFilterModalVisible(false);
          // Scroll to top after filter is applied
          setTimeout(() => {
            if (viewMode === 'grid') {
              mediaGridRef.current?.scrollToTop();
            } else {
              listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
            }
          }, 100);
        }}
        genreMap={genreMap}
      />

      <Toast ref={toastRef} />
      <ListActionsModal ref={listActionsModalRef} actions={listActions} />
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.xl,
  },
});
