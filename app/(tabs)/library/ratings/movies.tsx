import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { MovieRatingListCard } from '@/src/components/library/MovieRatingListCard';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import MediaSortModal, { DEFAULT_SORT_STATE, SortState } from '@/src/components/MediaSortModal';
import { MediaImage } from '@/src/components/ui/MediaImage';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  HIT_SLOP,
  SPACING,
} from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedMovieRating, useEnrichedMovieRatings } from '@/src/hooks/useEnrichedRatings';
import { createRatingSorter, sortHeaderStyles } from '@/src/hooks/useRatingSorting';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { ArrowUpDown, Grid3X3, List, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

type ViewMode = 'grid' | 'list';
const VIEW_MODE_STORAGE_KEY = 'movieRatingsViewMode';

export default function MovieRatingsScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const currentTab = useCurrentTab();
  const { data: enrichedRatings, isLoading } = useEnrichedMovieRatings();

  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [isLoadingPreference, setIsLoadingPreference] = useState(true);

  // Sort state
  const [sortModalVisible, setSortModalVisible] = useState(false);
  const [sortState, setSortState] = useState<SortState>(DEFAULT_SORT_STATE);
  const listRef = useRef<any>(null);
  const isInitialMount = useRef(true);

  // Load view mode preference
  useEffect(() => {
    const loadPreference = async () => {
      try {
        const saved = await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (saved === 'grid' || saved === 'list') {
          setViewMode(saved);
        }
      } catch (error) {
        console.error('Failed to load view mode preference:', error);
      } finally {
        setIsLoadingPreference(false);
      }
    };
    loadPreference();
  }, []);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newMode: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, newMode);
    } catch (error) {
      console.error('Failed to save view mode preference:', error);
    }
  }, [viewMode]);

  const hasActiveSort =
    sortState.option !== DEFAULT_SORT_STATE.option ||
    sortState.direction !== DEFAULT_SORT_STATE.direction;

  // Set up header with view mode toggle and sort button
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={toggleViewMode}
            activeOpacity={ACTIVE_OPACITY}
            hitSlop={HIT_SLOP.m}
          >
            {viewMode === 'grid' ? (
              <List size={24} color={COLORS.text} />
            ) : (
              <Grid3X3 size={24} color={COLORS.text} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setSortModalVisible(true)}
            activeOpacity={ACTIVE_OPACITY}
            style={sortHeaderStyles.headerButton}
            hitSlop={HIT_SLOP.m}
          >
            <ArrowUpDown size={22} color={COLORS.text} />
            {hasActiveSort && <View style={sortHeaderStyles.sortBadge} />}
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, viewMode, toggleViewMode, hasActiveSort]);

  // Scroll to top after sort state changes (but not on initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timeoutId = setTimeout(() => {
      listRef.current?.scrollToOffset?.({ offset: 0, animated: true });
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [sortState]);

  const handleApplySort = useCallback((newSortState: SortState) => {
    setSortState(newSortState);
  }, []);

  const sortedRatings = useMemo(() => {
    if (!enrichedRatings) return [];
    const filtered = [...enrichedRatings].filter((r) => r.movie !== null);
    const sorter = createRatingSorter<EnrichedMovieRating>((item) => item.movie, sortState);
    return filtered.sort(sorter);
  }, [enrichedRatings, sortState]);

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
  const ItemSeparator = useCallback(() => <View style={styles.listSeparator} />, []);

  if (isLoading || isLoadingPreference) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedRatings.length === 0) {
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
            ref={listRef}
            data={sortedRatings}
            renderItem={renderGridItem}
            keyExtractor={keyExtractor}
            numColumns={COLUMN_COUNT}
            contentContainerStyle={styles.gridListContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <FlatList
            ref={listRef}
            data={sortedRatings}
            renderItem={renderListItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={ItemSeparator}
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.m,
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
  listSeparator: {
    height: SPACING.m,
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
