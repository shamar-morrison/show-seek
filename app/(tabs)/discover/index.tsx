import { getImageUrl, Movie, TMDB_IMAGE_SIZES, tmdbApi, TVShow } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import DiscoverFilters, { FilterState } from '@/src/components/DiscoverFilters';
import AppErrorState from '@/src/components/ui/AppErrorState';
import { HeaderIconButton } from '@/src/components/ui/HeaderIconButton';
import { InlineListIndicators, ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useAuth } from '@/src/context/auth';
import { useGuestAccess } from '@/src/context/GuestAccessContext';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useGenres } from '@/src/hooks/useGenres';
import { metaTextStyles } from '@/src/styles/metaTextStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { useListMembership } from '@/src/hooks/useListMembership';
import { usePreferences } from '@/src/hooks/usePreferences';
import { ListMediaItem } from '@/src/services/ListService';
import { getThreeColumnGridMetrics, GRID_COLUMN_COUNT } from '@/src/utils/gridLayout';
import { dedupeMediaById } from '@/src/utils/mediaUtils';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { router, useSegments } from 'expo-router';
import { Grid3X3, List, SlidersHorizontal, Star } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MediaType = 'movie' | 'tv';
type ViewMode = 'list' | 'grid';

const DEFAULT_FILTERS: FilterState = {
  sortBy: 'popularity.desc',
  genre: null,
  year: null,
  rating: 0,
  language: null,
  watchProvider: null,
};
const VIEW_MODE_STORAGE_KEY = 'discoverViewMode';

export default function DiscoverScreen() {
  const segments = useSegments();
  const { width: windowWidth } = useWindowDimensions();
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { t } = useTranslation();
  const { preferences } = usePreferences();
  const { accentColor } = useAccentColor();
  const { user, isGuest } = useAuth();
  const { requireAccount } = useGuestAccess();

  // Load genres based on media type
  const genresQuery = useGenres(mediaType);
  const genreMap = genresQuery.data || {};
  const { getListsForMedia, showIndicators } = useListMembership();

  // Long-press to add to list
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const toastRef = useRef<ToastRef>(null);
  const [selectedMediaItem, setSelectedMediaItem] = useState<Omit<ListMediaItem, 'addedAt'> | null>(
    null
  );

  const discoverQuery = useInfiniteQuery({
    queryKey: ['discover', mediaType, filters, preferences?.hideUnreleasedContent],
    queryFn: async ({ pageParam = 1 }) => {
      const params = {
        genre: filters.genre?.toString(),
        year: filters.year || undefined,
        sortBy: filters.sortBy,
        voteAverageGte: filters.rating,
        withOriginalLanguage: filters.language || undefined,
        withWatchProviders: filters.watchProvider || undefined,
        page: pageParam,
        hideUnreleased: preferences?.hideUnreleasedContent,
      };

      if (mediaType === 'movie') {
        return await tmdbApi.discoverMovies(params);
      } else {
        return await tmdbApi.discoverTV(params);
      }
    },
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.total_pages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    initialPageParam: 1,
  });

  // Reset genre when media type changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, genre: null }));
  }, [mediaType]);

  useEffect(() => {
    const loadViewMode = async () => {
      try {
        const savedViewMode = await AsyncStorage.getItem(VIEW_MODE_STORAGE_KEY);
        if (savedViewMode === 'list' || savedViewMode === 'grid') {
          setViewMode(savedViewMode);
        }
      } catch (error) {
        console.error('Failed to load discover view mode preference:', error);
      }
    };

    void loadViewMode();
  }, []);

  const toggleViewMode = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const nextViewMode: ViewMode = viewMode === 'list' ? 'grid' : 'list';
    setViewMode(nextViewMode);
    try {
      await AsyncStorage.setItem(VIEW_MODE_STORAGE_KEY, nextViewMode);
    } catch (error) {
      console.error('Failed to save discover view mode preference:', error);
    }
  }, [viewMode]);

  const hasActiveFilters = () => {
    return (
      filters.sortBy !== DEFAULT_FILTERS.sortBy ||
      filters.genre !== DEFAULT_FILTERS.genre ||
      filters.year !== DEFAULT_FILTERS.year ||
      filters.rating !== DEFAULT_FILTERS.rating ||
      filters.language !== DEFAULT_FILTERS.language ||
      filters.watchProvider !== DEFAULT_FILTERS.watchProvider
    );
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleItemPress = useCallback((item: Movie | TVShow) => {
    const currentTab = segments[1];
    const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

    if ('title' in item) {
      router.push(`${basePath}/movie/${item.id}` as any);
    } else {
      router.push(`${basePath}/tv/${item.id}` as any);
    }
  }, [segments]);

  const handleLoadMore = () => {
    if (discoverQuery.hasNextPage && !discoverQuery.isFetchingNextPage) {
      discoverQuery.fetchNextPage();
    }
  };

  const handleLongPress = useCallback((item: Movie | TVShow) => {
    if (!user || isGuest) {
      requireAccount();
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const title = 'title' in item ? item.title : item.name;
    const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
    setSelectedMediaItem({
      id: item.id,
      media_type: mediaType,
      title: title || '',
      name: 'name' in item ? item.name : undefined,
      poster_path: item.poster_path,
      vote_average: item.vote_average,
      release_date: releaseDate || '',
      first_air_date: 'first_air_date' in item ? item.first_air_date : undefined,
    });
    // Note: Modal is presented via useEffect below to ensure it's mounted first
  }, [isGuest, mediaType, requireAccount, user]);

  // Present the modal when an item is selected
  // This uses useEffect to ensure the modal is mounted (if conditionally rendered)
  // before we try to present it
  useEffect(() => {
    if (selectedMediaItem) {
      addToListModalRef.current?.present();
    }
  }, [selectedMediaItem]);

  const handleShowToast = (message: string) => {
    toastRef.current?.show(message);
  };

  // Flatten paginated data and remove duplicate ids to keep keys stable.
  const allResults = useMemo<(Movie | TVShow)[]>(
    () => discoverQuery.data?.pages.flatMap((page) => page.results as (Movie | TVShow)[]) || [],
    [discoverQuery.data]
  );
  const uniqueResults = useMemo(() => dedupeMediaById(allResults), [allResults]);

  useEffect(() => {
    const duplicateCount = allResults.length - uniqueResults.length;
    if (process.env.NODE_ENV !== 'production' && duplicateCount > 0) {
      console.warn(`[discover] Removed ${duplicateCount} duplicate results for ${mediaType}`);
    }
  }, [allResults.length, mediaType, uniqueResults.length]);

  // Filter out watched content
  const filteredResults = useContentFilter(uniqueResults);
  const gridMetrics = useMemo(() => getThreeColumnGridMetrics(windowWidth), [windowWidth]);
  const { itemWidth, itemHorizontalMargin, listPaddingHorizontal } = gridMetrics;

  const renderMediaItem = useCallback(
    ({ item }: { item: Movie | TVShow }) => {
      const displayTitle = getDisplayMediaTitle(item, !!preferences?.showOriginalTitles);
      const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
      const posterUrl = getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small);

      const genres = item.genre_ids
        ? item.genre_ids
            .slice(0, 3)
            .map((id: number) => genreMap[id])
            .filter(Boolean)
        : [];

      const listIds = showIndicators ? getListsForMedia(item.id, mediaType) : [];

      return (
        <TouchableOpacity
          style={styles.resultItem}
          onPress={() => handleItemPress(item)}
          onLongPress={() => handleLongPress(item)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <View style={styles.posterContainer}>
            <MediaImage source={{ uri: posterUrl }} style={styles.resultPoster} contentFit="cover" />
          </View>
          <View style={styles.resultInfo}>
            <Text style={styles.resultTitle} numberOfLines={2}>
              {displayTitle}
            </Text>
            <View style={styles.metaRow}>
              {releaseDate && (
                <Text style={metaTextStyles.secondary}>{new Date(releaseDate).getFullYear()}</Text>
              )}
              {item.vote_average > 0 && releaseDate && (
                <Text style={metaTextStyles.secondary}> • </Text>
              )}
              {item.vote_average > 0 && (
                <View style={styles.ratingContainer}>
                  <Star size={14} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={styles.rating}>{item.vote_average.toFixed(1)}</Text>
                </View>
              )}
            </View>
            {genres.length > 0 && (
              <Text style={styles.genres} numberOfLines={1}>
                {genres.join(' • ')}
              </Text>
            )}
            {item.overview && (
              <Text style={styles.resultOverview} numberOfLines={3}>
                {item.overview}
              </Text>
            )}
            {listIds.length > 0 && <InlineListIndicators listIds={listIds} size="medium" />}
          </View>
        </TouchableOpacity>
      );
    },
    [
      genreMap,
      getListsForMedia,
      handleItemPress,
      handleLongPress,
      mediaType,
      preferences?.showOriginalTitles,
      showIndicators,
    ]
  );

  const renderGridItem = useCallback(
    ({ item }: { item: Movie | TVShow }) => {
      const displayTitle = getDisplayMediaTitle(item, !!preferences?.showOriginalTitles);
      const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
      const posterUrl = getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.medium);
      const year = releaseDate ? new Date(releaseDate).getFullYear() : null;
      const listIds = showIndicators ? getListsForMedia(item.id, mediaType) : [];

      return (
        <TouchableOpacity
          style={[styles.gridItem, { width: itemWidth, marginHorizontal: itemHorizontalMargin }]}
          onPress={() => handleItemPress(item)}
          onLongPress={() => handleLongPress(item)}
          activeOpacity={ACTIVE_OPACITY}
        >
          <View style={styles.gridPosterContainer}>
            <MediaImage
              source={{ uri: posterUrl }}
              style={[styles.gridPoster, { width: itemWidth, height: itemWidth * 1.5 }]}
              contentFit="cover"
            />
            {listIds.length > 0 && <ListMembershipBadge listIds={listIds} />}
          </View>
          <View style={styles.gridInfo}>
            <Text style={styles.gridTitle} numberOfLines={1}>
              {displayTitle}
            </Text>
            <View style={styles.gridMetaRow}>
              {year && <Text style={styles.gridMetaText}>{year}</Text>}
              {year && item.vote_average > 0 && <Text style={styles.gridMetaText}> • </Text>}
              {item.vote_average > 0 && (
                <View style={styles.gridRatingContainer}>
                  <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                  <Text style={styles.gridRating}>{item.vote_average.toFixed(1)}</Text>
                </View>
              )}
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [
      getListsForMedia,
      handleItemPress,
      handleLongPress,
      itemHorizontalMargin,
      itemWidth,
      mediaType,
      preferences?.showOriginalTitles,
      showIndicators,
    ]
  );

  const flashListContentContainerStyle = useMemo<ViewStyle>(
    () => {
      const flattenedStyle = StyleSheet.flatten([
        viewMode === 'list' ? styles.listContainer : styles.gridListContainer,
        viewMode === 'grid' ? { paddingHorizontal: listPaddingHorizontal } : null,
        { paddingBottom: 100 },
      ]);

      if (Array.isArray(flattenedStyle)) {
        return flattenedStyle.reduce<ViewStyle>((acc, style) => {
          if (!style || typeof style !== 'object') return acc;
          return { ...acc, ...(style as ViewStyle) };
        }, {});
      }

      return (flattenedStyle as ViewStyle) ?? {};
    },
    [viewMode, listPaddingHorizontal]
  );

  return (
    <>
      <SafeAreaView style={screenStyles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('tabs.discover')}</Text>
          <View style={styles.headerActions}>
            <HeaderIconButton onPress={toggleViewMode}>
              {viewMode === 'list' ? (
                <Grid3X3 size={24} color={COLORS.text} />
              ) : (
                <List size={24} color={COLORS.text} />
              )}
            </HeaderIconButton>
            <View style={styles.filterButtonWrapper}>
              <HeaderIconButton onPress={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal
                  size={24}
                  color={showFilters ? accentColor : COLORS.textSecondary}
                />
              </HeaderIconButton>
              {hasActiveFilters() && (
                <View style={[styles.filterBadge, { backgroundColor: accentColor }]} />
              )}
            </View>
          </View>
        </View>

        <View style={styles.typeToggleContainer}>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'movie' && { backgroundColor: accentColor }]}
            onPress={() => setMediaType('movie')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'movie' && styles.typeTextActive]}>
              {t('media.movies')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'tv' && { backgroundColor: accentColor }]}
            onPress={() => setMediaType('tv')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'tv' && styles.typeTextActive]}>
              {t('media.tvShows')}
            </Text>
          </TouchableOpacity>
        </View>

        {showFilters && (
          <DiscoverFilters
            filters={filters}
            onChange={setFilters}
            mediaType={mediaType}
            onClearFilters={clearFilters}
            genreMap={genreMap}
          />
        )}

        {discoverQuery.isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={accentColor} />
          </View>
        ) : discoverQuery.isError ? (
          <AppErrorState
            error={discoverQuery.error}
            message={t('errors.loadingFailed')}
            onRetry={() => {
              void discoverQuery.refetch();
            }}
            accentColor={accentColor}
          />
        ) : filteredResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
            <Text style={styles.emptySubtext}>{t('discover.adjustFilters')}</Text>
          </View>
        ) : (
          <FlashList
            key={`${viewMode}-${mediaType}`}
            data={filteredResults}
            renderItem={viewMode === 'list' ? renderMediaItem : renderGridItem}
            keyExtractor={(item: Movie | TVShow) => `${mediaType}-${item.id}`}
            contentContainerStyle={flashListContentContainerStyle}
            numColumns={viewMode === 'grid' ? GRID_COLUMN_COUNT : 1}
            maintainVisibleContentPosition={{ disabled: true }}
            drawDistance={600}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              discoverQuery.isFetchingNextPage ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color={accentColor} />
                </View>
              ) : null
            }
          />
        )}
      </SafeAreaView>

      {selectedMediaItem && (
        <AddToListModal
          ref={addToListModalRef}
          mediaItem={selectedMediaItem}
          onShowToast={handleShowToast}
        />
      )}
      <Toast ref={toastRef} />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.s,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerTitle: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  filterButtonWrapper: {
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  typeToggleContainer: {
    flexDirection: 'row',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  typeButton: {
    flex: 1,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  typeText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  typeTextActive: {
    color: COLORS.white,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.textSecondary,
    marginTop: SPACING.m,
  },
  emptySubtext: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
  },
  listContainer: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
  },
  gridListContainer: {
    paddingTop: SPACING.m,
  },
  gridItem: {
    backgroundColor: COLORS.transparent,
    marginBottom: SPACING.m,
  },
  gridPosterContainer: {
    position: 'relative',
  },
  gridPoster: {
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  gridInfo: {
    marginTop: SPACING.s,
  },
  gridTitle: {
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    color: COLORS.text,
  },
  gridMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    minHeight: FONT_SIZE.xs + 2,
  },
  gridMetaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  gridRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  gridRating: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  resultItem: {
    flexDirection: 'row',
    marginBottom: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    padding: SPACING.m,
  },
  posterContainer: {
    position: 'relative',
  },
  resultPoster: {
    width: 92,
    height: 138,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  resultInfo: {
    flex: 1,
    marginLeft: SPACING.m,
  },
  resultTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rating: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  resultOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
    lineHeight: 18,
  },
  genres: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  loadingMore: {
    paddingVertical: SPACING.l,
    alignItems: 'center',
  },
});
