import AddToListModal from '@/src/components/AddToListModal';
import { BulkRemoveProgressModal } from '@/src/components/library/BulkRemoveProgressModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { MediaGrid, MediaGridRef } from '@/src/components/library/MediaGrid';
import { MediaListCard } from '@/src/components/library/MediaListCard';
import { MultiSelectActionBar } from '@/src/components/library/MultiSelectActionBar';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { SearchEmptyState } from '@/src/components/library/SearchEmptyState';
import ListActionsModal, {
  ListActionsIcon,
  ListActionsModalRef,
} from '@/src/components/ListActionsModal';
import { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import ShuffleModal from '@/src/components/ShuffleModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import Toast from '@/src/components/ui/Toast';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { WATCH_STATUS_LISTS } from '@/src/constants/lists';
import { SPACING } from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useListDetailMultiSelectActions } from '@/src/hooks/useListDetailMultiSelectActions';
import { useLists, useRemoveFromList } from '@/src/hooks/useLists';
import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import { ListMediaItem } from '@/src/services/ListService';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { createSortAction } from '@/src/utils/listActions';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterMediaItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { FlashList } from '@shopify/flash-list';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Bookmark, Search, Shuffle, SlidersHorizontal } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Height reserved for header/footer chrome in empty state calculations */
const HEADER_FOOTER_CHROME_HEIGHT = 150;

export default function WatchStatusDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: lists, isLoading, isError, error, refetch } = useLists();
  const removeMutation = useRemoveFromList();
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
  // Get list title from config
  const listConfig = useMemo(() => {
    return WATCH_STATUS_LISTS.find((l) => l.id === id);
  }, [id]);

  const listTitle = listConfig ? t(listConfig.labelKey) : '';

  const list = useMemo(() => {
    return lists?.find((l) => l.id === id);
  }, [lists, id]);

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

    return sortedItems;
  }, [list, sortState, filterState]);

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

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
    sourceListName: list?.name ?? listTitle ?? '',
    selectedMediaItems,
    selectedCount,
    isSelectionMode,
    isRemoving: removeMutation.isPending,
    clearSelection,
    showToast: handleShowToast,
    removeItemFromSource: removeSelectedItemFromList,
    isSearchActive,
    deactivateSearch,
    dismissListActionsModal,
    insetsBottom: insets.bottom,
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

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: `@watch_status_view_mode_${id}`,
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
    (item: ListMediaItem) => {
      setShuffleModalVisible(false);
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
    ],
    [canShuffle, hasActiveFilterState, hasActiveSort, t]
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
      description: t('library.watchStatusEmptyDescription', { listName: listTitle }),
      actionLabel: t('library.browseContent'),
      onAction: () => router.push('/(tabs)/discover' as any),
    }),
    [router, t, listTitle]
  );

  // Navigate back if list is not found (shouldn't happen for system lists)
  useEffect(() => {
    if (!isLoading && lists && !listConfig) {
      router.replace('/(tabs)/library/watch-status');
    }
  }, [isLoading, lists, listConfig, router]);

  // Track if initial mount to avoid scrolling on first render
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
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

  if (isError) {
    return (
      <View style={screenStyles.container}>
        <Stack.Screen options={{ title: listTitle }} />
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          title={t('library.watchStatus')}
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </View>
    );
  }

  if (!listConfig) {
    return null;
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: listTitle,
        }}
      />

      <View style={libraryListStyles.divider} />

      <View style={[screenStyles.container, styles.container]}>
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
  listContent: {
    paddingTop: 0,
  },
});
