import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from "@shopify/flash-list";
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { Star, Compass, SlidersHorizontal } from 'lucide-react-native';
import { router } from 'expo-router';
import DiscoverFilters, { FilterState } from '@/src/components/DiscoverFilters';
import { MediaImage } from '@/src/components/ui/MediaImage';

type MediaType = 'movie' | 'tv';

export default function DiscoverScreen() {
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({
    sortBy: 'popularity.desc',
    genre: null,
    year: '',
    rating: 0,
    language: null,
  });

  const discoverQuery = useQuery({
    queryKey: ['discover', mediaType, filters],
    queryFn: async () => {
      const params = {
        genre: filters.genre?.toString(),
        year: filters.year ? parseInt(filters.year) : undefined,
        sortBy: filters.sortBy,
        voteAverageGte: filters.rating,
        withOriginalLanguage: filters.language || undefined,
      };

      if (mediaType === 'movie') {
        return await tmdbApi.discoverMovies(params);
      } else {
        return await tmdbApi.discoverTV(params);
      }
    },
  });

  // Reset genre when media type changes
  useEffect(() => {
    setFilters(prev => ({ ...prev, genre: null }));
  }, [mediaType]);

  const handleItemPress = (item: any) => {
    if (mediaType === 'movie') {
      router.push(`/movie/${item.id}` as any);
    } else {
      router.push(`/tv/${item.id}` as any);
    }
  };

  const renderMediaItem = ({ item }: { item: any }) => {
    const title = item.title || item.name;
    const releaseDate = item.release_date || item.first_air_date;
    const posterUrl = getImageUrl(
      item.poster_path,
      TMDB_IMAGE_SIZES.poster.small
    );

    return (
      <TouchableOpacity style={styles.resultItem} onPress={() => handleItemPress(item)}>
        <MediaImage
          source={{ uri: posterUrl }}
          style={styles.resultPoster}
          width={92}
          height={138}
          contentFit="cover"
        />
        <View style={styles.resultInfo}>
          <Text style={styles.resultTitle} numberOfLines={2}>
            {title}
          </Text>
          <View style={styles.metaRow}>
            {releaseDate && (
              <Text style={styles.resultYear}>
                {new Date(releaseDate).getFullYear()}
              </Text>
            )}
            {item.vote_average > 0 && releaseDate && (
              <Text style={styles.separator}> • </Text>
            )}
            {item.vote_average > 0 && (
              <View style={styles.ratingContainer}>
                <Star size={14} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={styles.rating}>{item.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
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
        >
          <SlidersHorizontal
            size={24}
            color={showFilters ? COLORS.primary : COLORS.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.typeToggleContainer}>
        <TouchableOpacity
          style={[styles.typeButton, mediaType === 'movie' && styles.typeButtonActive]}
          onPress={() => setMediaType('movie')}
        >
          <Text style={[styles.typeText, mediaType === 'movie' && styles.typeTextActive]}>
            Movies
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.typeButton, mediaType === 'tv' && styles.typeButtonActive]}
          onPress={() => setMediaType('tv')}
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
        />
      )}

      {discoverQuery.isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : discoverQuery.data?.results.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No results found</Text>
          <Text style={styles.emptySubtext}>Try adjusting your filters</Text>
        </View>
      ) : (
        <FlashList
          data={discoverQuery.data?.results || []}
          renderItem={renderMediaItem}
          keyExtractor={(item: any) => `${mediaType}-${item.id}`}
          contentContainerStyle={[styles.listContainer, { paddingBottom: 100 }]}
          showsVerticalScrollIndicator={false}
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
    paddingVertical: SPACING.m,
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
});
