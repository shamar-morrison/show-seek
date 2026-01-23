import { getImageUrl, Movie, TMDB_IMAGE_SIZES, tmdbApi, TVShow } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import DiscoverFilters, { FilterState } from '@/src/components/DiscoverFilters';
import { InlineListIndicators } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useGenres } from '@/src/hooks/useGenres';
import { useListMembership } from '@/src/hooks/useListMembership';
import { ListMediaItem } from '@/src/services/ListService';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, useSegments } from 'expo-router';
import { SlidersHorizontal, Star } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MediaType = 'movie' | 'tv';

const DEFAULT_FILTERS: FilterState = {
  sortBy: 'popularity.desc',
  genre: null,
  year: null,
  rating: 0,
  language: null,
  watchProvider: null,
};

export default function DiscoverScreen() {
  const segments = useSegments();
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const { t } = useTranslation();

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
    queryKey: ['discover', mediaType, filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = {
        genre: filters.genre?.toString(),
        year: filters.year || undefined,
        sortBy: filters.sortBy,
        voteAverageGte: filters.rating,
        withOriginalLanguage: filters.language || undefined,
        withWatchProviders: filters.watchProvider || undefined,
        page: pageParam,
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

  const handleItemPress = (item: Movie | TVShow) => {
    const currentTab = segments[1];
    const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

    if ('title' in item) {
      router.push(`${basePath}/movie/${item.id}` as any);
    } else {
      router.push(`${basePath}/tv/${item.id}` as any);
    }
  };

  const handleLoadMore = () => {
    if (discoverQuery.hasNextPage && !discoverQuery.isFetchingNextPage) {
      discoverQuery.fetchNextPage();
    }
  };

  const handleLongPress = (item: Movie | TVShow) => {
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
  };

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

  // Flatten paginated data
  const allResults: (Movie | TVShow)[] =
    discoverQuery.data?.pages.flatMap((page) => page.results as (Movie | TVShow)[]) || [];

  // Filter out watched content
  const filteredResults = useContentFilter(allResults);

  const renderMediaItem = ({ item }: { item: Movie | TVShow }) => {
    const title = 'title' in item ? item.title : item.name;
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
            {title}
          </Text>
          <View style={styles.metaRow}>
            {releaseDate && (
              <Text style={styles.resultYear}>{new Date(releaseDate).getFullYear()}</Text>
            )}
            {item.vote_average > 0 && releaseDate && <Text style={styles.separator}> • </Text>}
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
  };

  return (
    <>
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{t('tabs.discover')}</Text>
          <TouchableOpacity
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={ACTIVE_OPACITY}
          >
            <SlidersHorizontal
              size={24}
              color={showFilters ? COLORS.primary : COLORS.textSecondary}
            />
            {hasActiveFilters() && <View style={styles.filterBadge} />}
          </TouchableOpacity>
        </View>

        <View style={styles.typeToggleContainer}>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'movie' && styles.typeButtonActive]}
            onPress={() => setMediaType('movie')}
            activeOpacity={ACTIVE_OPACITY}
          >
            <Text style={[styles.typeText, mediaType === 'movie' && styles.typeTextActive]}>
              {t('media.movies')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeButton, mediaType === 'tv' && styles.typeButtonActive]}
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
            <ActivityIndicator size="large" color={COLORS.primary} />
          </View>
        ) : filteredResults.length === 0 ? (
          <View style={styles.centerContainer}>
            <Text style={styles.emptyText}>{t('common.noResults')}</Text>
            <Text style={styles.emptySubtext}>{t('discover.adjustFilters')}</Text>
          </View>
        ) : (
          <FlashList
            data={filteredResults}
            renderItem={renderMediaItem}
            keyExtractor={(item: any) => `${mediaType}-${item.id}`}
            contentContainerStyle={[styles.listContainer, { paddingBottom: 100 }]}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              discoverQuery.isFetchingNextPage ? (
                <View style={styles.loadingMore}>
                  <ActivityIndicator size="small" color={COLORS.primary} />
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
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
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
  filterToggle: {
    padding: SPACING.s,
    position: 'relative',
  },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
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
  typeButtonActive: {
    backgroundColor: COLORS.primary,
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
  resultYear: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  separator: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
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
