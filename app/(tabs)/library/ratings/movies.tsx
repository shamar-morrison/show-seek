import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MovieRatingListCard } from '@/src/components/library/MovieRatingListCard';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import ListActionsModal from '@/src/components/ListActionsModal';
import MediaSortModal, { RATING_SCREEN_SORT_OPTIONS } from '@/src/components/MediaSortModal';
import { MediaImage } from '@/src/components/ui/MediaImage';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedMovieRating, useEnrichedMovieRatings } from '@/src/hooks/useEnrichedRatings';
import { useRatingScreenLogic } from '@/src/hooks/useRatingScreenLogic';
import { DEFAULT_WATCH_STATUS_FILTERS } from '@/src/utils/listFilters';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Search, SlidersHorizontal, Star } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

const VIEW_MODE_STORAGE_KEY = 'movieRatingsViewMode';

const getMovieFromItem = (item: EnrichedMovieRating) => item.movie;

export default function MovieRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: enrichedRatings, isLoading } = useEnrichedMovieRatings();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

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
      placeholder: 'Search movies...',
    },
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

  const handleItemPress = useCallback(
    (movieId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!currentTab) {
        console.warn('Cannot navigate to movie: currentTab is null');
        return;
      }
      const path = `/(tabs)/${currentTab}/movie/${movieId}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: EnrichedMovieRating }) => {
      if (!item.movie) return null;

      return (
        <Pressable
          style={({ pressed }) => [styles.mediaCard, pressed && styles.mediaCardPressed]}
          onPress={() => handleItemPress(item.movie!.id)}
        >
          <MediaImage
            source={{ uri: getImageUrl(item.movie.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
            style={styles.poster}
            contentFit="cover"
          />
          <View style={styles.ratingBadgeContainer}>
            <RatingBadge rating={item.rating.rating} size="medium" />
          </View>
          {item.movie && (
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.movie.title}
              </Text>
              {item.movie.release_date && (
                <View style={styles.yearRatingContainer}>
                  <Text style={styles.year}>{new Date(item.movie.release_date).getFullYear()}</Text>
                  {item.movie.vote_average > 0 && (
                    <>
                      <Text style={styles.separator}> • </Text>
                      <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                      <Text style={styles.rating}>{item.movie.vote_average.toFixed(1)}</Text>
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
    ({ item }: { item: EnrichedMovieRating }) => (
      <MovieRatingListCard item={item} onPress={handleItemPress} />
    ),
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: EnrichedMovieRating) => item.rating.id, []);

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedData.length === 0 && !hasActiveFilterState) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Star}
          title="No Movie Ratings"
          description="Rate movies to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
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
              searchQuery ? (
                <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                  <EmptyState
                    icon={Search}
                    title="No results found"
                    description="Try a different search term."
                  />
                </View>
              ) : hasActiveFilterState ? (
                <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                  <EmptyState
                    icon={SlidersHorizontal}
                    title="No items match your filters"
                    description="Try adjusting your filters to see more results."
                    actionLabel="Clear Filters"
                    onAction={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                  />
                </View>
              ) : null
            }
          />
        ) : (
          <FlashList
            key="list"
            ref={listRef}
            data={displayItems}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              searchQuery ? (
                <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                  <EmptyState
                    icon={Search}
                    title="No results found"
                    description="Try a different search term."
                  />
                </View>
              ) : hasActiveFilterState ? (
                <View style={{ height: windowHeight - insets.top - insets.bottom - 150 }}>
                  <EmptyState
                    icon={SlidersHorizontal}
                    title="No items match your filters"
                    description="Try adjusting your filters to see more results."
                    actionLabel="Clear Filters"
                    onAction={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                  />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      <MediaSortModal
        visible={sortModalVisible}
        onClose={() => setSortModalVisible(false)}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  gridListContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
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
  info: {
    marginTop: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  yearRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: SPACING.xs,
  },
  year: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  separator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  rating: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});
