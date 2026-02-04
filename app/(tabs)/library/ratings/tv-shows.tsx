import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { LibrarySortModal } from '@/src/components/library/LibrarySortModal';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import { RatingsEmptyState } from '@/src/components/library/RatingsEmptyState';
import { TVShowRatingListCard } from '@/src/components/library/TVShowRatingListCard';
import ListActionsModal from '@/src/components/ListActionsModal';
import { RATING_SCREEN_SORT_OPTIONS } from '@/src/components/MediaSortModal';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedTVRating, useEnrichedTVRatings } from '@/src/hooks/useEnrichedRatings';
import { useHeaderSearch } from '@/src/hooks/useHeaderSearch';
import { useRatingScreenLogic } from '@/src/hooks/useRatingScreenLogic';
import { libraryListStyles } from '@/src/styles/libraryListStyles';
import { mediaCardStyles } from '@/src/styles/mediaCardStyles';
import { mediaMetaStyles } from '@/src/styles/mediaMetaStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, Star } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const VIEW_MODE_STORAGE_KEY = 'tvShowRatingsViewMode';

// Memoized media extractor for performance
const getTVShowFromItem = (item: EnrichedTVRating) => item.tvShow;

export default function TVShowRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: enrichedRatings, isLoading } = useEnrichedTVRatings();
  const { t } = useTranslation();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const emptyStateHeight = windowHeight - insets.top - insets.bottom - 150;

  // Search functionality using shared hook (initialize with empty array first)
  const {
    searchQuery,
    isSearchActive,
    filteredItems,
    deactivateSearch,
    setSearchQuery,
    searchButton,
  } = useHeaderSearch({
    items: [] as EnrichedTVRating[],
    getSearchableText: (item) => item.tvShow?.name || '',
  });

  // Use shared rating screen logic with search integration
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
    getMediaFromItem: getTVShowFromItem,
    searchButton,
    searchState: {
      isActive: isSearchActive,
      query: searchQuery,
      onQueryChange: setSearchQuery,
      onClose: deactivateSearch,
      placeholder: t('library.searchTVShowsPlaceholder'),
    },
  });

  // Filter sortedData based on search query (useHeaderSearch's filtering won't work
  // since we had to initialize with empty array due to hook ordering)
  const displayItems = React.useMemo(() => {
    if (!searchQuery.trim()) return sortedData;
    const query = searchQuery.toLowerCase().trim();
    return sortedData.filter((item) => {
      const name = item.tvShow?.name || '';
      return name.toLowerCase().includes(query);
    });
  }, [sortedData, searchQuery]);

  const handleItemPress = useCallback(
    (tvShowId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const basePath = currentTab ? `/(tabs)/${currentTab}` : '';
      router.push(`${basePath}/tv/${tvShowId}` as any);
    },
    [currentTab, router]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: EnrichedTVRating }) => {
      if (!item.tvShow) return null;

      return (
        <Pressable
          style={({ pressed }) => [styles.mediaCard, pressed && styles.mediaCardPressed]}
          onPress={() => handleItemPress(item.tvShow!.id)}
        >
          <MediaImage
            source={{
              uri: getImageUrl(item.tvShow.poster_path, TMDB_IMAGE_SIZES.poster.medium),
            }}
            style={styles.poster}
            contentFit="cover"
          />
          <View style={styles.ratingBadgeContainer}>
            <RatingBadge rating={item.rating.rating} size="medium" />
          </View>
          {item.tvShow && (
            <View style={mediaCardStyles.info}>
              <Text style={mediaCardStyles.title} numberOfLines={1}>
                {item.tvShow.name}
              </Text>
              {item.tvShow.first_air_date && (
                <View style={mediaMetaStyles.yearRatingContainer}>
                  <Text style={mediaMetaStyles.year}>
                    {new Date(item.tvShow.first_air_date).getFullYear()}
                  </Text>
                  {item.tvShow.vote_average > 0 && (
                    <>
                      <Text style={mediaMetaStyles.separator}> • </Text>
                      <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                      <Text style={mediaMetaStyles.rating}>
                        {item.tvShow.vote_average.toFixed(1)}
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
    [handleItemPress]
  );

  const renderListItem = useCallback(
    ({ item }: { item: EnrichedTVRating }) => (
      <TVShowRatingListCard item={item} onPress={handleItemPress} />
    ),
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: EnrichedTVRating) => item.rating.id, []);

  if (isLoading || isLoadingPreference) {
    return <FullScreenLoading />;
  }

  if (sortedData.length === 0 && !hasActiveFilterState) {
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
            numColumns={COLUMN_COUNT}
            contentContainerStyle={styles.gridListContent}
            showsVerticalScrollIndicator={false}
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
            contentContainerStyle={libraryListStyles.listContent}
            showsVerticalScrollIndicator={false}
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
    </>
  );
}

const styles = StyleSheet.create({
  gridListContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
  },
  mediaCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.m,
    marginRight: SPACING.m,
  },
  mediaCardPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingBadgeContainer: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
  },
});
