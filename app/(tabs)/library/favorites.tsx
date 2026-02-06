import AddToListModal from '@/src/components/AddToListModal';
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
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import Toast from '@/src/components/ui/Toast';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { DEFAULT_LIST_IDS } from '@/src/constants/lists';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAllGenres } from '@/src/hooks/useGenres';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useLists } from '@/src/hooks/useLists';
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
import { useRouter } from 'expo-router';
import { Heart, Search, SlidersHorizontal } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const VIEW_MODE_STORAGE_KEY = 'favoritesViewMode';
const MULTI_SELECT_ACTION_BAR_HEIGHT = 124;

export default function FavoritesScreen() {
  const router = useRouter();
  const { data: lists, isLoading } = useLists();
  const { t } = useTranslation();
  const movieLabel = t('media.movie');
  const tvShowLabel = t('media.tvShow');
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
    selectedMediaItems,
    selectedCount,
    isSelectionMode,
    isItemSelected,
    clearSelection,
    toastRef,
  } = useMediaGridHandlers(isLoading);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const hasActiveFilterState = hasActiveFilters(filterState);

  const actionButton = useMemo(
    () => ({
      icon: ListActionsIcon,
      onPress: () => listActionsModalRef.current?.present(),
      showBadge: hasActiveSort || hasActiveFilterState,
    }),
    [hasActiveSort, hasActiveFilterState]
  );

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

  // Search functionality
  const {
    searchQuery,
    isSearchActive,
    filteredItems: searchFilteredItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: listItems,
    getSearchableText: (item) => item.title || item.name || '',
  });

  // The final items to display (with search applied)
  const displayItems = searchFilteredItems;

  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: VIEW_MODE_STORAGE_KEY,
    showSortButton: false,
    actionButton: isSelectionMode ? undefined : actionButton,
    searchButton: isSelectionMode ? undefined : searchButton,
    searchState: {
      isActive: isSearchActive,
      query: searchQuery,
      onQueryChange: setSearchQuery,
      onClose: deactivateSearch,
      placeholder: t('library.searchFavoritesPlaceholder'),
    },
  });

  const handleApplySort = (newSortState: SortState) => {
    setSortState(newSortState);
  };

  const selectionContentBottomPadding = isSelectionMode
    ? MULTI_SELECT_ACTION_BAR_HEIGHT + insets.bottom
    : 0;

  useEffect(() => {
    if (isSelectionMode && isSearchActive) {
      deactivateSearch();
    }
  }, [deactivateSearch, isSearchActive, isSelectionMode]);

  useEffect(() => {
    if (isSelectionMode) {
      listActionsModalRef.current?.dismiss();
    }
  }, [isSelectionMode]);

  const listActions = useMemo(
    () => [
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
    [hasActiveFilterState, hasActiveSort, t]
  );

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
    [handleItemPress, handleLongPress, isItemSelected, isSelectionMode, movieLabel, tvShowLabel]
  );

  const keyExtractor = useCallback((item: ListMediaItem) => `${item.id}-${item.media_type}`, []);

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (listItems.length === 0 && !hasActiveFilterState) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Heart}
          title={t('library.emptyFavorites')}
          description={t('library.emptyFavoritesHint')}
          actionLabel={t('library.browseContent')}
          onAction={() => router.push('/(tabs)/discover' as any)}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <View style={styles.content}>
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
                    ? {
                        icon: SlidersHorizontal,
                        title: t('discover.noResultsWithFilters'),
                        description: t('discover.adjustFilters'),
                        actionLabel: t('common.reset'),
                        onAction: () => setFilterState(DEFAULT_WATCH_STATUS_FILTERS),
                      }
                    : {
                        icon: Heart,
                        title: t('library.emptyFavorites'),
                        description: t('library.emptyFavoritesHint'),
                        actionLabel: t('library.browseContent'),
                        onAction: () => router.push('/(tabs)/discover' as any),
                      }
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
                selectionContentBottomPadding > 0 && { paddingBottom: selectionContentBottomPadding },
              ]}
              showsVerticalScrollIndicator={false}
              extraData={selectedMediaItems}
              ListEmptyComponent={
                searchQuery ? (
                  <SearchEmptyState height={windowHeight - insets.top - insets.bottom - 150} />
                ) : hasActiveFilterState ? (
                  <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                    <EmptyState
                      icon={SlidersHorizontal}
                      title={t('discover.noResultsWithFilters')}
                      description={t('discover.adjustFilters')}
                      actionLabel={t('common.reset')}
                      onAction={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                    />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </SafeAreaView>

      {selectedCount > 0 && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItems={selectedMediaItems}
          sourceListId={DEFAULT_LIST_IDS[3]}
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

      {isSelectionMode && (
        <MultiSelectActionBar
          selectedCount={selectedCount}
          onCancel={clearSelection}
          onAddToList={() => addToListModalRef.current?.present()}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    paddingTop: SPACING.m,
  },
});
