import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Star } from 'lucide-react-native';
import React, { useCallback } from 'react';
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const collectionId = Number(id);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();

  const collectionQuery = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => tmdbApi.getCollectionDetails(collectionId),
    enabled: !!collectionId,
  });

  const navigateToMovie = useCallback(
    (movieId: number) => {
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}/movie/${movieId}` as any);
      } else {
        router.push(`/movie/${movieId}` as any);
      }
    },
    [currentTab, router]
  );

  if (collectionQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (collectionQuery.isError || !collectionQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load collection</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const collection = collectionQuery.data;

  // Sort movies chronologically by release date
  const sortedMovies = [...collection.parts].sort(
    (a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime()
  );

  const backdropUrl = getImageUrl(collection.backdrop_path, TMDB_IMAGE_SIZES.backdrop.large);

  const formatYear = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).getFullYear().toString();
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={collection.name}
        onBackPress={() => router.back()}
        scrollY={scrollY}
      />

      <Animated.ScrollView style={styles.scrollView} bounces={false} {...scrollViewProps}>
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <MediaImage source={{ uri: backdropUrl }} style={styles.backdrop} contentFit="cover" />
          <LinearGradient
            colors={['transparent', COLORS.overlay, COLORS.background]}
            style={styles.gradient}
          />
          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => router.back()}
              activeOpacity={ACTIVE_OPACITY}
            >
              <ArrowLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{collection.name}</Text>

          {collection.overview && (
            <ExpandableText
              text={collection.overview}
              style={styles.overview}
              readMoreStyle={styles.readMore}
            />
          )}

          <Text style={styles.sectionTitle}>
            {sortedMovies.length} {sortedMovies.length === 1 ? 'Movie' : 'Movies'}
          </Text>

          {/* Movie List */}
          {sortedMovies.map((movie) => {
            const posterUrl = getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.small);
            const year = formatYear(movie.release_date);

            return (
              <TouchableOpacity
                key={movie.id}
                style={styles.movieCard}
                onPress={() => navigateToMovie(movie.id)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
                <View style={styles.movieInfo}>
                  <Text style={styles.movieTitle} numberOfLines={2}>
                    {movie.title}
                  </Text>
                  <View style={styles.movieMeta}>
                    {year && <Text style={styles.movieYear}>{year}</Text>}
                    {year && movie.vote_average > 0 && (
                      <Text style={styles.metaSeparator}> • </Text>
                    )}
                    {movie.vote_average > 0 && (
                      <View style={styles.rating}>
                        <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
                        <Text style={styles.ratingText}>{movie.vote_average.toFixed(1)}</Text>
                      </View>
                    )}
                  </View>
                  {movie.overview && (
                    <Text style={styles.movieOverview} numberOfLines={2}>
                      {movie.overview}
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    marginBottom: SPACING.l,
    textAlign: 'center',
  },
  backButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.l,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  backButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  scrollView: {
    flex: 1,
  },
  heroSection: {
    height: 300,
    position: 'relative',
  },
  backdrop: {
    width: '100%',
    height: '100%',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
  },
  headerSafe: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 10,
  },
  headerButton: {
    marginTop: SPACING.m,
    marginLeft: SPACING.m,
    width: 40,
    height: 40,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.overlay,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: SPACING.l,
    marginTop: -SPACING.xxl,
  },
  title: {
    fontSize: FONT_SIZE.hero,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  overview: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZE.m * 1.5,
    marginBottom: SPACING.s,
  },
  readMore: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  movieCard: {
    flexDirection: 'row',
    marginBottom: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    padding: SPACING.m,
  },
  poster: {
    width: 80,
    height: 120,
  },
  movieInfo: {
    flex: 1,
    padding: SPACING.m,
    justifyContent: 'center',
  },
  movieTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.xs,
  },
  movieMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  movieYear: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  metaSeparator: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  ratingText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.text,
    fontWeight: '600',
  },
  movieOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZE.s * 1.4,
  },
});
