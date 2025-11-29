import { Genre, getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { TabSelector } from '@/src/components/ui/TabSelector';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { getGenres } from '@/src/utils/genreCache';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { router, useSegments } from 'expo-router';
import { Search as SearchIcon, Star } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type MediaType = 'all' | 'movie' | 'tv';

const MEDIA_TYPE_OPTIONS = [
  { value: 'all' as const, label: 'All' },
  { value: 'movie' as const, label: 'Movies' },
  { value: 'tv' as const, label: 'TV Shows' },
];

export default function SearchScreen() {
  const segments = useSegments();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [mediaType, setMediaType] = useState<MediaType>('all');
  const [genreMap, setGenreMap] = useState<Record<number, string>>({});

  // Load genres from cache or API
  useEffect(() => {
    const loadGenres = async () => {
      try {
        const map = await getGenres();
        setGenreMap(map);
      } catch (error) {
        console.error('Failed to load genres', error);
      }
    };

    loadGenres();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  const searchResultsQuery = useQuery({
    queryKey: ['search', debouncedQuery, mediaType],
    queryFn: async () => {
      if (!debouncedQuery.trim()) return { results: [] };

      switch (mediaType) {
        case 'movie':
          return await tmdbApi.searchMovies(debouncedQuery);
        case 'tv':
          return await tmdbApi.searchTV(debouncedQuery);
        default:
          return await tmdbApi.searchMulti(debouncedQuery);
      }
    },
    enabled: debouncedQuery.length > 0,
  });

  const handleItemPress = (item: any) => {
    const currentTab = segments[1];
    const basePath = currentTab ? `/(tabs)/${currentTab}` : '';

    // Check media_type first to avoid ambiguity
    if (item.media_type === 'person') {
      router.push(`${basePath}/person/${item.id}` as any);
    } else if (item.media_type === 'movie' || 'title' in item) {
      router.push(`${basePath}/movie/${item.id}` as any);
    } else if (item.media_type === 'tv' || 'name' in item) {
      router.push(`${basePath}/tv/${item.id}` as any);
    }
  };

  const renderMediaItem = ({ item }: { item: any }) => {
    const isPerson = item.media_type === 'person';
    const title = item.title || item.name;
    const releaseDate = item.release_date || item.first_air_date;
    const posterUrl = getImageUrl(
      item.poster_path || item.profile_path,
      TMDB_IMAGE_SIZES.poster.small
    );

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
          {isPerson && item.known_for_department && (
            <Text style={styles.department}>{item.known_for_department}</Text>
          )}
          {!isPerson && (
            <>
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
            </>
          )}
          {isPerson && item.known_for && item.known_for.length > 0 && (
            <Text style={styles.knownFor} numberOfLines={2}>
              Known for:{' '}
              {item.known_for
                .slice(0, 3)
                .map((work: any) => work.title || work.name)
                .join(', ')}
            </Text>
          )}
          {!isPerson && item.overview && (
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
        <Text style={styles.headerTitle}>Search</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchInputContainer}>
          <SearchIcon size={20} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Movie, TV show, or Person"
            placeholderTextColor={COLORS.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      </View>

      <TabSelector
        options={MEDIA_TYPE_OPTIONS}
        value={mediaType}
        onChange={setMediaType}
      />

      {searchResultsQuery.isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : debouncedQuery.length === 0 ? (
        <View style={styles.centerContainer}>
          <SearchIcon size={64} color={COLORS.textSecondary} />
          <Text style={styles.emptyText}>Search for movies and TV shows</Text>
        </View>
      ) : searchResultsQuery.data?.results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your search</Text>
        </View>
      ) : (
        <FlashList
          data={searchResultsQuery.data?.results || []}
          renderItem={renderMediaItem}
          keyExtractor={(item: any) => `${item.media_type || mediaType}-${item.id}`}
          contentContainerStyle={[styles.listContainer]}
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          drawDistance={400}
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
  searchContainer: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    paddingHorizontal: SPACING.m,
    height: 48,
  },
  searchInput: {
    flex: 1,
    marginLeft: SPACING.m,
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  department: {
    fontSize: FONT_SIZE.s,
    color: COLORS.primary,
    marginTop: 2,
  },
  knownFor: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginTop: SPACING.s,
    lineHeight: 18,
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
});
