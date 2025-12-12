import AddToListModal from '@/src/components/AddToListModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import Toast from '@/src/components/ui/Toast';
import { DEFAULT_LIST_IDS } from '@/src/constants/lists';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useLists } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const VIEW_MODE_STORAGE_KEY = 'favoritesViewMode';

export default function FavoritesScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const mediaGridRef = useRef<MediaGridRef>(null);
  const listRef = useRef<any>(null);

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

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: VIEW_MODE_STORAGE_KEY,
    showSortButton: true,
    hasActiveSort,
    onSortPress: () => setSortModalVisible(true),
  });

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
      if (viewMode === 'grid') {
        mediaGridRef.current?.scrollToTop();
      } else {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [sortState, viewMode]);

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

  if (listItems.length === 0) {
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
