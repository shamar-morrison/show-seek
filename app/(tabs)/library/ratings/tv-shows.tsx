import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import { TVShowRatingListCard } from '@/src/components/library/TVShowRatingListCard';
import ListActionsModal, { ListActionsModalRef } from '@/src/components/ListActionsModal';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { MediaImage } from '@/src/components/ui/MediaImage';
import WatchStatusFiltersModal from '@/src/components/WatchStatusFiltersModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedTVRating, useEnrichedTVRatings } from '@/src/hooks/useEnrichedRatings';
import { useAllGenres } from '@/src/hooks/useGenres';
import { createRatingSorter } from '@/src/hooks/useRatingSorting';
import { useViewModeToggle } from '@/src/hooks/useViewModeToggle';
import {
  DEFAULT_WATCH_STATUS_FILTERS,
  filterRatingItems,
  hasActiveFilters,
  WatchStatusFilterState,
} from '@/src/utils/listFilters';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { ArrowUpDown, Settings2, SlidersHorizontal, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

const VIEW_MODE_STORAGE_KEY = 'tvShowRatingsViewMode';

export default function TVShowRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: enrichedRatings, isLoading } = useEnrichedTVRatings();

  // Sort state
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [filterState, setFilterState] = useState<WatchStatusFilterState>(
    DEFAULT_WATCH_STATUS_FILTERS
  );
  const listRef = useRef<FlashListRef<EnrichedTVRating>>(null);
  const listActionsModalRef = useRef<ListActionsModalRef>(null);
  const isInitialMount = useRef(true);

  // Fetch genre data for filter modal
  const { data: genreMap = {} } = useAllGenres();

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  const hasActiveFilterState = hasActiveFilters(filterState);

  const actionButton = useMemo(
    () => ({
      icon: Settings2,
      onPress: () => listActionsModalRef.current?.present(),
      showBadge: hasActiveSort || hasActiveFilterState,
    }),
    [hasActiveSort, hasActiveFilterState]
  );

  // View mode toggle hook
  const { viewMode, isLoadingPreference } = useViewModeToggle({
    storageKey: VIEW_MODE_STORAGE_KEY,
    showSortButton: false,
    actionButton,
  });

  // Scroll to top after sort/filter state changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [sortState, filterState]);

  const handleApplySort = useCallback((newSortState: SortState) => {
    setSortState(newSortState);
  }, []);

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

  const sortedRatings = useMemo(() => {
    if (!enrichedRatings) return [];

    // First filter out null tvShows, then apply filters
    const validRatings = [...enrichedRatings].filter((r) => r.tvShow !== null);
    const filtered = filterRatingItems(validRatings, filterState, (item) => item.tvShow);

    // Then apply sorting
    const sorter = createRatingSorter<EnrichedTVRating>((item) => item.tvShow, sortState);
    return filtered.sort(sorter);
  }, [enrichedRatings, sortState, filterState]);

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
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.tvShow.name}
              </Text>
              {item.tvShow.first_air_date && (
                <View style={styles.yearRatingContainer}>
                  <Text style={styles.year}>
                    {new Date(item.tvShow.first_air_date).getFullYear()}
                  </Text>
                  {item.tvShow.vote_average > 0 && (
                    <>
                      <Text style={styles.separator}> • </Text>
                      <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                      <Text style={styles.rating}>{item.tvShow.vote_average.toFixed(1)}</Text>
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
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedRatings.length === 0 && !hasActiveFilterState) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <View style={styles.divider} />
        <EmptyState
          icon={Star}
          title="No TV Show Ratings"
          description="Rate TV shows to see them here."
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
            data={sortedRatings}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            numColumns={COLUMN_COUNT}
            contentContainerStyle={styles.gridListContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              hasActiveFilterState ? (
                <EmptyState
                  icon={SlidersHorizontal}
                  title="No items match your filters"
                  description="Try adjusting your filters to see more results."
                  actionLabel="Clear Filters"
                  onAction={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                />
              ) : null
            }
          />
        ) : (
          <FlashList
            key="list"
            ref={listRef}
            data={sortedRatings}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              hasActiveFilterState ? (
                <EmptyState
                  icon={SlidersHorizontal}
                  title="No items match your filters"
                  description="Try adjusting your filters to see more results."
                  actionLabel="Clear Filters"
                  onAction={() => setFilterState(DEFAULT_WATCH_STATUS_FILTERS)}
                />
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
