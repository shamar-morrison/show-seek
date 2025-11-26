import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useInfiniteQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS, ACTIVE_OPACITY } from '@/src/constants/theme';
import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES, Genre, Movie, TVShow } from '@/src/api/tmdb';
import { Star, Compass, SlidersHorizontal } from 'lucide-react-native';
import { router } from 'expo-router';
import DiscoverFilters, { FilterState } from '@/src/components/DiscoverFilters';
import { MediaImage } from '@/src/components/ui/MediaImage';

type MediaType = 'movie' | 'tv';

const DEFAULT_FILTERS: FilterState = {
  sortBy: 'popularity.desc',
  genre: null,
  year: null,
  rating: 0,
  language: null,
};

export default function DiscoverScreen() {
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS);
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});

  // Fetch genres for both movies and TV shows
  useEffect(() => {
    const fetchGenres = async () => {
      try {
        const [movieGenres, tvGenres] = await Promise.all([
          tmdbApi.getGenres('movie'),
          tmdbApi.getGenres('tv'),
        ]);

        const map: Record<number, string> = {};
        [...movieGenres, ...tvGenres].forEach((genre: Genre) => {
          map[genre.id] = genre.name;
        });
        setGenreMap(map);
      } catch (error) {
        console.error('Failed to load genres', error);
      }
    };

    fetchGenres();
  }, []);

  const discoverQuery = useInfiniteQuery({
    queryKey: ['discover', mediaType, filters],
    queryFn: async ({ pageParam = 1 }) => {
      const params = {
        genre: filters.genre?.toString(),
        year: filters.year || undefined,
        sortBy: filters.sortBy,
        voteAverageGte: filters.rating,
        withOriginalLanguage: filters.language || undefined,
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
      filters.language !== DEFAULT_FILTERS.language
    );
  };

  const clearFilters = () => {
    setFilters(DEFAULT_FILTERS);
  };

  const handleItemPress = (item: Movie | TVShow) => {
    if ('title' in item) {
      router.push(`/movie/${item.id}` as any);
    } else {
      router.push(`/tv/${item.id}` as any);
    }
  };

  const handleLoadMore = () => {
    if (discoverQuery.hasNextPage && !discoverQuery.isFetchingNextPage) {
      discoverQuery.fetchNextPage();
    }
  };

  // Flatten paginated data
  const allResults: (Movie | TVShow)[] =
    discoverQuery.data?.pages.flatMap((page) => page.results as (Movie | TVShow)[]) || [];

  const renderMediaItem = ({ item }: { item: Movie | TVShow }) => {
    const title = 'title' in item ? item.title : item.name;
    const releaseDate = 'release_date' in item ? item.release_date : item.first_air_date;
    const posterUrl = getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small);

    // Get genre names from genre_ids
    const genres = item.genre_ids
      ? item.genre_ids
          .slice(0, 3)
          .map((id: number) => genreMap[id])
          .filter(Boolean)
      : [];

    return (
      <TouchableOpacity
        style={styles.resultItem}
        onPress={() => handleItemPress(item)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <MediaImage source={{ uri: posterUrl }} style={styles.resultPoster} contentFit="cover" />
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
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
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
            Movies
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, mediaType === 'tv' && styles.typeButtonActive]}
          onPress={() => setMediaType('tv')}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={[styles.typeText, mediaType === 'tv' && styles.typeTextActive]}>
            TV Shows
          </Text>
        </TouchableOpacity>
      </View>

      {showFilters && (
        <DiscoverFilters
          filters={filters}
          onChange={setFilters}
          mediaType={mediaType}
          onClearFilters={clearFilters}
        />
      )}

      {discoverQuery.isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : allResults.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
        </View>
      ) : (
        <FlashList
          data={allResults}
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
