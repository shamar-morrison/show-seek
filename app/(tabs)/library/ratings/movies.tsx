import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { BulkRemoveProgressModal } from '@/src/components/library/BulkRemoveProgressModal';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { MovieRatingListCard } from '@/src/components/library/MovieRatingListCard';
import { MultiSelectActionBar } from '@/src/components/library/MultiSelectActionBar';
import { QueryErrorState } from '@/src/components/library/QueryErrorState';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import { RatingsEmptyState } from '@/src/components/library/RatingsEmptyState';
import ListActionsModal from '@/src/components/ListActionsModal';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { RATING_SCREEN_SORT_OPTIONS } from '@/src/components/MediaSortModal';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedMovieRating, useEnrichedMovieRatings } from '@/src/hooks/useEnrichedRatings';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import {
  RatingMultiSelectTarget,
  useRatingMultiSelectActions,
} from '@/src/hooks/useRatingMultiSelectActions';
import { useRatingScreenLogic } from '@/src/hooks/useRatingScreenLogic';
import { useDeleteRating } from '@/src/hooks/useRatings';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Search, Star } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const VIEW_MODE_STORAGE_KEY = 'movieRatingsViewMode';

const getMovieFromItem = (item: EnrichedMovieRating) => item.movie;
type MovieRatingSelectionTarget = Extract<RatingMultiSelectTarget, { mediaType: 'movie' }>;

export default function MovieRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { accentColor } = useAccentColor();
  const {
    data: enrichedRatings,
    isLoading,
    error,
    refetch,
  } = useEnrichedMovieRatings();
  const deleteRatingMutation = useDeleteRating();
  const { t } = useTranslation();
  const { resolvePosterPath } = usePosterOverrides();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const toastRef = useRef<ToastRef>(null);
  const emptyStateHeight = windowHeight - insets.top - insets.bottom - 150;
  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } =
    getThreeColumnGridMetrics(windowWidth);

  // Search functionality - create searchButton first, then pass to useRatingScreenLogic
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);

  const activateSearch = useCallback(() => {
    setIsSearchActive(true);
  }, []);

  const deactivateSearch = useCallback(() => {
    setIsSearchActive(false);
    setSearchQuery('');
  }, []);

  const searchButton = useMemo(
    () => ({
      icon: Search,
      onPress: activateSearch,
      showBadge: searchQuery.length > 0,
    }),
    [activateSearch, searchQuery.length]
  );

  const handleShowToast = useCallback((message: string) => {
    toastRef.current?.show(message);
  }, []);

  const handleNavigate = useCallback(
    (item: EnrichedMovieRating) => {
      if (!item.movie) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!currentTab) {
        console.warn('Cannot navigate to movie: currentTab is null');
        return;
      }
      const path = `/(tabs)/${currentTab}/movie/${item.movie.id}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const getSelectionTarget = useCallback(
    (item: EnrichedMovieRating): MovieRatingSelectionTarget | null =>
      item.movie
        ? {
            id: item.rating.id,
            mediaType: 'movie',
            mediaId: item.movie.id,
          }
        : null,
    []
  );

  const removeRating = useCallback(
    (target: MovieRatingSelectionTarget) =>
      deleteRatingMutation.mutateAsync({ mediaId: target.mediaId, mediaType: target.mediaType }),
    [deleteRatingMutation]
  );

  const {
    handleItemPress,
    handleLongPress,
    selectedCount,
    isSelectionMode,
    isItemSelected,
    clearSelection,
    selectionContentBottomPadding,
    handleActionBarHeightChange,
    handleRemoveSelectedItems,
    bulkRemoveProgress,
    isBulkRemoving,
  } = useRatingMultiSelectActions<EnrichedMovieRating, MovieRatingSelectionTarget>({
    isLoading,
    isRemoving: deleteRatingMutation.isPending,
    getSelectionTarget,
    onNavigate: handleNavigate,
    showToast: handleShowToast,
    removeRating,
    isSearchActive,
    deactivateSearch,
    insetsBottom: insets.bottom,
  });

  const {
    sortState,
    filterState,
    sortModalVisible,
    filterModalVisible,
    hasActiveFilterState,
    viewMode,
    isLoadingPreference,
    listRef,
    listActionsModalRef,
    setSortModalVisible,
    setFilterModalVisible,
    setFilterState,
    handleApplySort,
    listActions,
    sortedData,
    genreMap,
  } = useRatingScreenLogic({
    storageKey: VIEW_MODE_STORAGE_KEY,
    data: enrichedRatings,
    getMediaFromItem: getMovieFromItem,
    searchButton,
    searchState: {
      isActive: isSearchActive,
      query: searchQuery,
      onQueryChange: setSearchQuery,
      onClose: deactivateSearch,
      placeholder: t('library.searchMoviesPlaceholder'),
    },
    isSelectionMode,
  });

  // Filter items based on search query
  const displayItems = useMemo(() => {
    if (!searchQuery.trim()) return sortedData;
    const query = searchQuery.toLowerCase().trim();
    return sortedData.filter((item) => {
      const title = item.movie?.title || '';
      return title.toLowerCase().includes(query);
    });
  }, [sortedData, searchQuery]);

  const renderGridItem = useCallback(
    ({ item }: { item: EnrichedMovieRating }) => {
      if (!item.movie) return null;

      const posterPath = resolvePosterPath('movie', item.movie.id, item.movie.poster_path);
      const isSelected = isItemSelected(item);

      return (
        <Pressable
          style={({ pressed }) => [
            styles.mediaCard,
            { width: itemWidth, marginHorizontal: itemHorizontalMargin },
            pressed && styles.mediaCardPressed,
          ]}
          onPress={() => handleItemPress(item)}
          onLongPress={() => handleLongPress(item)}
        >
          <View style={styles.posterContainer}>
            <MediaImage
              source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.medium) }}
              style={[styles.poster, { width: itemWidth, height: itemWidth * 1.5 }]}
              contentFit="cover"
            />
            {isSelectionMode && (
              <View
                pointerEvents="none"
                style={[
                  styles.selectionOverlay,
                  isSelected && { borderColor: accentColor, backgroundColor: COLORS.overlaySubtle },
                ]}
              />
            )}
            <View style={styles.ratingBadgeContainer}>
              <RatingBadge rating={item.rating.rating} size="medium" />
            </View>
            {isSelectionMode && (
              <View
                style={[
                  styles.selectionBadge,
                  isSelected && { backgroundColor: accentColor, borderColor: accentColor },
                ]}
              >
                <AnimatedCheck visible={isSelected} />
              </View>
            )}
          </View>
          {item.movie && (
            <View style={mediaCardStyles.info}>
              <Text style={mediaCardStyles.title} numberOfLines={1}>
                {item.movie.title}
              </Text>
              {item.movie.release_date && (
                <View style={mediaMetaStyles.yearRatingContainer}>
                  <Text style={mediaMetaStyles.year}>
                    {new Date(item.movie.release_date).getFullYear()}
                  </Text>
                  {item.movie.vote_average > 0 && (
                    <>
                      <Text style={mediaMetaStyles.separator}> • </Text>
                      <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                      <Text style={mediaMetaStyles.rating}>
                        {item.movie.vote_average.toFixed(1)}
                      </Text>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [
      accentColor,
      handleItemPress,
      handleLongPress,
      isItemSelected,
      isSelectionMode,
      itemHorizontalMargin,
      itemWidth,
      resolvePosterPath,
    ]
  );

  const renderListItem = useCallback(
    ({ item }: { item: EnrichedMovieRating }) => (
      <MovieRatingListCard
        item={item}
        onPress={() => handleItemPress(item)}
        onLongPress={handleLongPress}
        selectionMode={isSelectionMode}
        isSelected={isItemSelected(item)}
      />
    ),
    [handleItemPress, handleLongPress, isItemSelected, isSelectionMode]
  );

  const keyExtractor = useCallback((item: EnrichedMovieRating) => item.rating.id, []);

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (error) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <QueryErrorState
          error={error}
          onRetry={() => {
            void refetch();
          }}
        />
      </SafeAreaView>
    );
  }

  if (sortedData.length === 0 && !hasActiveFilterState && !isSelectionMode && !isBulkRemoving) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        <EmptyState
          icon={Star}
          title={t('library.emptyRatings')}
          description={t('library.emptyRatingsHint')}
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['bottom']}>
        <View style={libraryListStyles.divider} />
        {viewMode === 'grid' ? (
          <FlashList
            key="grid"
            ref={listRef}
            data={displayItems}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            numColumns={GRID_COLUMN_COUNT}
            contentContainerStyle={[
              styles.gridListContent,
              { paddingHorizontal: listPaddingHorizontal },
              selectionContentBottomPadding > 0 && { paddingBottom: selectionContentBottomPadding },
            ]}
            showsVerticalScrollIndicator={false}
            extraData={isItemSelected}
            ListEmptyComponent={
              <RatingsEmptyState
                searchQuery={searchQuery}
                hasActiveFilterState={hasActiveFilterState}
                height={emptyStateHeight}
                onClearFilters={setFilterState}
              />
            }
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
            extraData={isItemSelected}
            ListEmptyComponent={
              <RatingsEmptyState
                searchQuery={searchQuery}
                hasActiveFilterState={hasActiveFilterState}
                height={emptyStateHeight}
                onClearFilters={setFilterState}
              />
            }
          />
        )}
      </SafeAreaView>

      <LibrarySortModal
        visible={sortModalVisible}
        setVisible={setSortModalVisible}
        sortState={sortState}
        onApplySort={handleApplySort}
        showUserRatingOption
        allowedOptions={RATING_SCREEN_SORT_OPTIONS}
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
        showMediaTypeFilter={false}
      />

      <ListActionsModal ref={listActionsModalRef} actions={listActions} />

      <Toast ref={toastRef} />

      <BulkRemoveProgressModal
        visible={isBulkRemoving}
        current={bulkRemoveProgress?.processed ?? 0}
        total={bulkRemoveProgress?.total ?? 0}
        title={t('library.removingRatingsTitle')}
        progressText={t('library.removingRatingsProgress', {
          current: bulkRemoveProgress?.processed ?? 0,
          total: bulkRemoveProgress?.total ?? 0,
        })}
      />

      {isSelectionMode && (
        <MultiSelectActionBar
          selectedCount={selectedCount}
          onCancel={clearSelection}
          onRemoveItems={handleRemoveSelectedItems}
          onHeightChange={handleActionBarHeightChange}
          removeLabel={t('library.removeRatings')}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  gridListContent: {
    paddingTop: SPACING.m,
  },
  mediaCard: {
    marginBottom: SPACING.m,
  },
  mediaCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  posterContainer: {
    position: 'relative',
  },
  poster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingBadgeContainer: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
  },
  selectionOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  selectionBadge: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.white,
    backgroundColor: COLORS.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
