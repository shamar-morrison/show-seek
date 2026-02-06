import AddToListModal from '@/src/components/AddToListModal';
import { BulkRemoveProgressModal } from '@/src/components/library/BulkRemoveProgressModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { MultiSelectActionBar } from '@/src/components/library/MultiSelectActionBar';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import ListActionsModal, {
  ListActionsIcon,
  ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import RenameListModal, { RenameListModalRef } from '@/src/components/RenameListModal';
import ShuffleModal from '@/src/components/ShuffleModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import Toast from '@/src/components/ui/Toast';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useListDetailMultiSelectActions } from '@/src/hooks/useListDetailMultiSelectActions';
import { useDeleteList, useLists, useRemoveFromList } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { createSortAction } from '@/src/utils/listActions';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Pencil, Search, Shuffle, SlidersHorizontal, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height reserved for header/footer chrome in empty state calculations */
const HEADER_FOOTER_CHROME_HEIGHT = 150;

export default function CustomListDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading } = useLists();
  const deleteMutation = useDeleteList();
  const removeMutation = useRemoveFromList();
  const { requireAuth, isAuthenticated, AuthGuardModal } = useAuthGuard();
  const { t } = useTranslation();
  const movieLabel = t('media.movie');
  const tvShowLabel = t('media.tvShow');
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );
  const [shuffleModalVisible, setShuffleModalVisible] = useState(false);
  const renameModalRef = useRef<RenameListModalRef>(null);
  const mediaGridRef = useRef<MediaGridRef>(null);
  const listRef = useRef<React.ComponentRef<typeof FlashList<ListMediaItem>>>(null);
  const listActionsModalRef = useRef<ListActionsModalRef>(null);
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { data: genreMap = {} } = useAllGenres();

  const {
    handleItemPress,
    handleLongPress,
    handleShowToast,
    addToListModalRef,
    selectedMediaItems,
    selectedCount,
    isSelectionMode,
    isItemSelected,
    clearSelection,
    toastRef,
  } = useMediaGridHandlers(isLoading);
  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

  const handleRenameList = useCallback(() => {
    if (!list) return;
    if (!isAuthenticated) {
      requireAuth(() => {}, t('library.signInToRenameList'));
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    renameModalRef.current?.present({
      listId: id!,
      currentName: list.name,
      currentDescription: list.description ?? '',
    });
  }, [list, id, isAuthenticated, requireAuth, t]);

  const listItems = useMemo(() => {
    if (!list?.items) return [];
    const items = Object.values(list.items);

    // Apply filters first
    const filteredItems = filterMediaItems(items, filterState);

    // Then apply sorting
    const sortedItems = [...filteredItems].sort((a, b) => {
      const direction = sortState.direction === 'asc' ? 1 : -1;

      switch (sortState.option) {
        case 'recentlyAdded':
          // Ascending: oldest first (a.addedAt - b.addedAt)
          return (a.addedAt - b.addedAt) * direction;
        case 'releaseDate': {
          // Movies use release_date, TV shows use first_air_date
          const dateA = a.release_date || a.first_air_date || '';
          const dateB = b.release_date || b.first_air_date || '';
          // Ascending: earliest date first
          return dateA.localeCompare(dateB) * direction;
        }
        case 'rating':
          // Ascending: lowest rating first
          return ((a.vote_average ?? 0) - (b.vote_average ?? 0)) * direction;
        case 'alphabetical': {
          // Movies use title, TV shows use name
          const titleA = (a.title || a.name || '').toLowerCase();
          const titleB = (b.title || b.name || '').toLowerCase();
          // Ascending: A-Z
          return titleA.localeCompare(titleB) * direction;
        }
        default:
          return 0;
      }
    });

    return sortedItems;
  }, [list, sortState, filterState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

  const handleDeleteList = useCallback(() => {
    if (!list || !id || deleteMutation.isPending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      t('library.deleteList'),
      `${t('library.confirmDeleteList', { name: list.name })}\n${t('library.deleteListWarning')}`,
      [
        {
          text: t('common.cancel'),
          style: 'cancel',
        },
        {
          text: t('common.delete'),
          style: 'destructive',
          onPress: async () => {
            if (!isAuthenticated) {
              requireAuth(() => {}, t('library.signInToDeleteList'));
              return;
            }
            try {
              await deleteMutation.mutateAsync(id);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              // Navigation is handled by useEffect when list is no longer found
            } catch (error) {
              console.error('Failed to delete list:', error);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert(
                t('common.error'),
                error instanceof Error ? error.message : t('errors.deleteFailed')
              );
            }
          },
        },
      ]
    );
  }, [list, id, deleteMutation, requireAuth, isAuthenticated, t]);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const hasActiveFilterState = hasActiveFilters(filterState);

  // Search functionality
  const {
    searchQuery,
    isSearchActive,
    filteredItems: displayItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: listItems,
    getSearchableText: (item) => item.title || item.name || '',
  });

  const actionButton = useMemo(
    () => ({
      icon: ListActionsIcon,
      onPress: () => {
        listActionsModalRef.current?.present();
      },
      showBadge: hasActiveSort || hasActiveFilterState,
    }),
    [hasActiveSort, hasActiveFilterState]
  );

  const dismissListActionsModal = useCallback(() => {
    listActionsModalRef.current?.dismiss();
  }, []);

  const removeSelectedItemFromList = useCallback(
    (mediaId: number) => removeMutation.mutateAsync({ listId: id, mediaId }),
    [id, removeMutation]
  );

  const {
    bulkAddMode,
    bulkPrimaryLabel,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleRemoveSelectedItems,
    bulkRemoveProgress,
    isBulkRemoving,
  } = useListDetailMultiSelectActions({
    sourceListId: id,
    sourceListName: list?.name ?? id ?? '',
    selectedMediaItems,
    selectedCount,
    isSelectionMode,
    isRemoving: removeMutation.isPending,
    clearSelection,
    showToast: handleShowToast,
    removeItemFromSource: removeSelectedItemFromList,
    requireAuth,
    authPromptMessage: t('library.signInToDeleteList'),
    isAuthenticated,
    guardBeforeConfirmation: true,
    isSearchActive,
    deactivateSearch,
    dismissListActionsModal,
    insetsBottom: insets.bottom,
  });

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: `@custom_list_view_mode_${id}`,
    showSortButton: false,
    actionButton: isSelectionMode ? undefined : actionButton,
    searchButton: isSelectionMode ? undefined : searchButton,
    searchState: {
      isActive: isSearchActive,
      query: searchQuery,
      onQueryChange: setSearchQuery,
      onClose: deactivateSearch,
      placeholder: t('library.searchListPlaceholder'),
    },
  });

  const canShuffle = displayItems.length >= 2;

  const handleShuffleSelect = useCallback(
    (item: import('@/src/services/ListService').ListMediaItem) => {
      setShuffleModalVisible(false);
      // Small delay to let modal close, then navigate
      setTimeout(() => {
        const route =
          item.media_type === 'movie'
            ? `/(tabs)/library/movie/${item.id}`
            : `/(tabs)/library/tv/${item.id}`;
        router.push(route as any);
      }, 300);
    },
    [router]
  );

  const listActions = useMemo(
    () => [
      {
        id: 'shuffle',
        icon: Shuffle,
        label: t('library.shufflePick'),
        onPress: () => setShuffleModalVisible(true),
        disabled: !canShuffle,
      },
      {
        id: 'filter',
        icon: SlidersHorizontal,
        label: t('library.filterItems'),
        onPress: () => setFilterModalVisible(true),
        showBadge: hasActiveFilterState,
      },
      createSortAction({
        onPress: () => setSortModalVisible(true),
        showBadge: hasActiveSort,
      }),
      {
        id: 'rename',
        icon: Pencil,
        label: t('library.renameList'),
        onPress: handleRenameList,
      },
      {
        id: 'delete',
        icon: Trash2,
        label: t('library.deleteList'),
        onPress: handleDeleteList,
        color: COLORS.error,
      },
    ],
    [canShuffle, hasActiveFilterState, hasActiveSort, handleRenameList, handleDeleteList, t]
  );

  const filterEmptyState = useMemo(
    () => ({
      icon: SlidersHorizontal,
      title: t('discover.noResultsWithFilters'),
      description: t('discover.adjustFilters'),
      actionLabel: t('common.reset'),
      onAction: () => setFilterState(DEFAULT_WATCH_STATUS_FILTERS),
    }),
    [t]
  );

  const defaultEmptyState = useMemo(
    () => ({
      icon: Bookmark,
      title: t('library.emptyList'),
      description: t('library.emptyListHint'),
      actionLabel: t('library.browseContent'),
      onAction: () => router.push('/(tabs)/discover' as any),
    }),
    [router, t]
  );

  // Navigate back if list is deleted
  useEffect(() => {
    if (!isLoading && lists && !list) {
      router.replace('/(tabs)/library/custom-lists');
    }
  }, [isLoading, lists, list, router]);

  // Track if initial mount to avoid scrolling on first render
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    // Use setTimeout to allow FlashList to finish re-rendering
    // 200ms delay provides more reliable timing across devices with varying performance
    const timeoutId = setTimeout(() => {
      if (viewMode === 'grid') {
        mediaGridRef.current?.scrollToTop();
      } else {
        listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
      }
    }, 200);
    return () => clearTimeout(timeoutId);
  }, [sortState, filterState]);

  const renderListItem = useCallback(
    ({ item }: { item: ListMediaItem }) => (
      <MediaListCard
        item={item}
        onPress={handleItemPress}
        onLongPress={handleLongPress}
        selectionMode={isSelectionMode}
        isSelected={isItemSelected(item)}
        movieLabel={movieLabel}
        tvShowLabel={tvShowLabel}
      />
    ),
    [handleItemPress, handleLongPress, isItemSelected, isSelectionMode]
  );

  const keyExtractor = useCallback((item: ListMediaItem) => `${item.id}-${item.media_type}`, []);

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (!list) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: list.name,
        }}
      />

      <View style={libraryListStyles.divider} />

      <View style={[screenStyles.container, styles.container]}>
        {!!list.description?.trim() && (
          <View style={styles.detailHeader}>
            <Text style={styles.detailDescription}>{list.description.trim()}</Text>
          </View>
        )}
        {viewMode === 'grid' ? (
          <MediaGrid
            key="grid"
            ref={mediaGridRef}
            items={displayItems}
            isLoading={isLoading}
            emptyState={
              searchQuery
                ? {
                    icon: Search,
                    title: t('common.noResults'),
                    description: t('search.adjustSearch'),
                  }
                : hasActiveFilterState
                  ? filterEmptyState
                  : defaultEmptyState
            }
            onItemPress={handleItemPress}
            onItemLongPress={handleLongPress}
            selectionMode={isSelectionMode}
            isItemSelected={isItemSelected}
            contentBottomPadding={selectionContentBottomPadding}
          />
        ) : (
          <FlashList
            key="list"
            ref={listRef}
            data={displayItems}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={[
              libraryListStyles.listContent,
              styles.listContent,
              selectionContentBottomPadding > 0 && { paddingBottom: selectionContentBottomPadding },
            ]}
            showsVerticalScrollIndicator={false}
            extraData={selectedMediaItems}
            ListEmptyComponent={
              <View
                style={{
                  height: windowHeight - insets.top - insets.bottom - HEADER_FOOTER_CHROME_HEIGHT,
                }}
              >
                {searchQuery ? (
                  <SearchEmptyState />
                ) : (
                  <EmptyState {...(hasActiveFilterState ? filterEmptyState : defaultEmptyState)} />
                )}
              </View>
            }
          />
        )}
      </View>

      {selectedCount > 0 && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItems={selectedMediaItems}
          sourceListId={id}
          bulkAddMode={bulkAddMode}
          onShowToast={handleShowToast}
          onComplete={clearSelection}
        />
      )}

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        allowedOptions={['recentlyAdded', 'releaseDate', 'rating', 'alphabetical']}
      />

      <WatchStatusFiltersModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        filters={filterState}
        onApplyFilters={(newFilters) => {
          setFilterState(newFilters);
          setFilterModalVisible(false);
        }}
        genreMap={genreMap}
      />

      <Toast ref={toastRef} />
      {AuthGuardModal}
      <RenameListModal ref={renameModalRef} />
      <ListActionsModal ref={listActionsModalRef} actions={listActions} />

      <ShuffleModal
        visible={shuffleModalVisible}
        items={displayItems}
        onClose={() => setShuffleModalVisible(false)}
        onViewDetails={handleShuffleSelect}
      />

      <BulkRemoveProgressModal
        visible={isBulkRemoving}
        current={bulkRemoveProgress?.processed ?? 0}
        total={bulkRemoveProgress?.total ?? 0}
      />

      {isSelectionMode && (
        <MultiSelectActionBar
          selectedCount={selectedCount}
          onCancel={clearSelection}
          onRemoveItems={handleRemoveSelectedItems}
          bulkPrimaryLabel={bulkPrimaryLabel}
          onHeightChange={handleActionBarHeightChange}
          onAddToList={() => addToListModalRef.current?.present()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: SPACING.m,
  },
  detailHeader: {
    paddingHorizontal: SPACING.l,
    paddingBottom: SPACING.m,
  },
  detailDescription: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  listContent: {
    paddingTop: 0,
  },
});
