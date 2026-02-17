import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import {
  useCanTrackMoreCollections,
  useCollectionTracking,
  useStartCollectionTracking,
  useStopCollectionTracking,
} from '@/src/hooks/useCollectionTracking';
import { usePreferences } from '@/src/hooks/usePreferences';
import { errorStyles } from '@/src/styles/errorStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { showPremiumAlert } from '@/src/utils/premiumAlert';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Play, Star, StopCircle } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function CollectionScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const currentTab = useCurrentTab();
  const { accentColor } = useAccentColor();
  const collectionId = Number(id);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { preferences } = usePreferences();
  const { isPremium } = usePremium();
  const isAccountRequired = useAccountRequired();

  // Collection tracking state
  const {
    tracking,
    isTracked,
    watchedCount,
    totalMovies,
    percentage,
    isLoading: isLoadingTracking,
  } = useCollectionTracking(collectionId);
  const { canTrackMore, maxFreeCollections } = useCanTrackMoreCollections();
  const startTrackingMutation = useStartCollectionTracking();
  const stopTrackingMutation = useStopCollectionTracking();

  const collectionQuery = useQuery({
    queryKey: ['collection', collectionId],
    queryFn: () => tmdbApi.getCollectionDetails(collectionId),
    enabled: !!collectionId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - collection data rarely changes
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
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

  // Get watched movie IDs as a Set for efficient lookup
  const watchedMovieIds = useMemo(
    () => new Set(tracking?.watchedMovieIds ?? []),
    [tracking?.watchedMovieIds]
  );

  const handleStartTracking = useCallback(() => {
    if (isAccountRequired()) return;
    if (!collectionQuery.data) return;

    // Guard: don't start tracking if already tracked
    if (isTracked) return;

    if (!canTrackMore) {
      showPremiumAlert('premiumFeature.features.collectionTracking');
      return;
    }

    (async () => {
      try {
        await startTrackingMutation.mutateAsync({
          collectionId,
          name: collectionQuery.data.name,
          totalMovies: collectionQuery.data.parts.length,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (error) {
        console.error('[CollectionScreen] Failed to start tracking:', error);
      }
    })();
  }, [
    isAccountRequired,
    collectionQuery.data,
    isTracked,
    canTrackMore,
    startTrackingMutation,
    collectionId,
  ]);

  const handleStopTracking = useCallback(() => {
    if (isAccountRequired()) return;
    if (!collectionQuery.data) return;

    stopTrackingMutation.mutate(
      {
        collectionId,
        collectionName: collectionQuery.data.name,
      },
      {
        onSuccess: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        },
        onError: (error) => {
          // Cancelled by user is not an error to log
          if (error.message !== 'Cancelled') {
            console.error('[CollectionScreen] Failed to stop tracking:', error);
          }
        },
      }
    );
  }, [isAccountRequired, collectionQuery.data, stopTrackingMutation, collectionId]);

  if (collectionQuery.isLoading) {
    return <FullScreenLoading />;
  }

  if (collectionQuery.isError || !collectionQuery.data) {
    return (
      <View style={[errorStyles.container, styles.errorContainer]}>
        <Text style={[errorStyles.text, styles.errorText]}>{t('collection.failedToLoad')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.backButton, { backgroundColor: accentColor }]}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const collection = collectionQuery.data;

  const getReleaseTimestamp = (releaseDate?: string | null) => {
    if (!releaseDate) return Number.POSITIVE_INFINITY;
    const timestamp = new Date(releaseDate).getTime();
    return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
  };

  // Sort movies chronologically by release date, keeping invalid/missing dates at the end.
  const sortedMovies = [...collection.parts]
    .map((movie, index) => ({ movie, index }))
    .sort((a, b) => {
      const timestampDiff =
        getReleaseTimestamp(a.movie.release_date) - getReleaseTimestamp(b.movie.release_date);
      if (timestampDiff !== 0) return timestampDiff;

      const titleDiff = (a.movie.title || '').localeCompare(b.movie.title || '');
      if (titleDiff !== 0) return titleDiff;

      return a.index - b.index;
    })
    .map(({ movie }) => movie);

  const backdropUrl = getImageUrl(collection.backdrop_path, TMDB_IMAGE_SIZES.backdrop.large);

  const formatYear = (dateString: string) => {
    if (!dateString) return '';
    return new Date(dateString).getFullYear().toString();
  };

  const isButtonLoading = startTrackingMutation.isPending || stopTrackingMutation.isPending;

  return (
    <View style={screenStyles.container}>
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

          {/* Overview */}
          {collection.overview && (
            <ExpandableText
              text={collection.overview}
              style={styles.overview}
              readMoreStyle={[styles.readMore, { color: accentColor }]}
            />
          )}

          {/* Tracking Button & Progress */}
          <View style={styles.trackingSection}>
            {isTracked ? (
              <>
                {/* Progress Bar */}
                <View style={styles.progressContainer}>
                  <View style={styles.progressTextRow}>
                    <Text style={styles.progressText}>
                      {t('collection.moviesWatched', { watchedCount, totalMovies })}
                    </Text>
                    <Text style={[styles.percentageText, { color: accentColor }]}>
                      {percentage}%
                    </Text>
                  </View>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${percentage}%`, backgroundColor: accentColor },
                      ]}
                    />
                  </View>
                </View>

                {/* Stop Tracking Button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.trackingButton,
                    styles.stopTrackingButton,
                    pressed && styles.buttonPressed,
                  ]}
                  onPress={handleStopTracking}
                  disabled={isButtonLoading}
                >
                  {isButtonLoading ? (
                    <ActivityIndicator size="small" color={COLORS.error} />
                  ) : (
                    <>
                      <StopCircle size={20} color={COLORS.error} />
                      <Text style={styles.stopTrackingText}>{t('collection.stopTracking')}</Text>
                    </>
                  )}
                </Pressable>
              </>
            ) : (
              <Pressable
                style={({ pressed }) => [
                  styles.trackingButton,
                  styles.startTrackingButton,
                  { backgroundColor: accentColor },
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleStartTracking}
                disabled={isButtonLoading || isLoadingTracking}
              >
                {isButtonLoading || isLoadingTracking ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Play size={20} color={COLORS.white} fill={COLORS.white} />
                    <Text style={styles.startTrackingText}>{t('collection.startTracking')}</Text>
                  </>
                )}
              </Pressable>
            )}

            {/* Free user limit notice */}
            {!isPremium && !isTracked && !canTrackMore && (
              <Text style={styles.limitNotice}>
                {t('collection.freeLimitNotice', { count: maxFreeCollections })}
              </Text>
            )}
          </View>

          <Text style={styles.sectionTitle}>
            {t('collection.moviesCount', { count: sortedMovies.length })}
          </Text>

          {/* Movie List */}
          {sortedMovies.map((movie) => {
            const posterUrl = getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.small);
            const year = formatYear(movie.release_date);
            const isWatched = watchedMovieIds.has(movie.id);

            return (
              <TouchableOpacity
                key={movie.id}
                style={styles.movieCard}
                onPress={() => navigateToMovie(movie.id)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <View style={styles.posterContainer}>
                  <MediaImage
                    source={{ uri: posterUrl }}
                    style={styles.poster}
                    contentFit="cover"
                  />
                  {isTracked && isWatched && (
                    <View style={styles.watchedBadge}>
                      <Check size={14} color={COLORS.white} strokeWidth={3} />
                    </View>
                  )}
                </View>
                <View style={styles.movieInfo}>
                  <Text style={styles.movieTitle} numberOfLines={2}>
                    {getDisplayMediaTitle(movie, !!preferences?.showOriginalTitles)}
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
  errorContainer: {
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.l,
    color: COLORS.text,
    marginBottom: SPACING.l,
    textAlign: 'center',
  },
  backButton: {
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
    marginBottom: SPACING.s,
  },
  // Tracking Section
  trackingSection: {
    marginBottom: SPACING.l,
    marginTop: SPACING.l,
  },
  trackingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
  },
  startTrackingButton: {
  },
  stopTrackingButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  buttonPressed: {
    opacity: ACTIVE_OPACITY,
  },
  startTrackingText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  stopTrackingText: {
    color: COLORS.error,
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
  },
  progressContainer: {
    marginBottom: SPACING.m,
  },
  progressTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  progressText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  percentageText: {
    fontSize: FONT_SIZE.s,
    fontWeight: 'bold',
  },
  progressBarBg: {
    height: 8,
    backgroundColor: COLORS.secondary,
    borderRadius: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  limitNotice: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: SPACING.s,
  },
  // Overview
  overview: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: FONT_SIZE.m * 1.5,
    marginBottom: SPACING.xs,
  },
  readMore: {
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
  // Movie Card
  movieCard: {
    flexDirection: 'row',
    marginBottom: SPACING.m,
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    overflow: 'hidden',
    padding: SPACING.m,
  },
  posterContainer: {
    position: 'relative',
  },
  poster: {
    width: 80,
    height: 120,
    borderRadius: BORDER_RADIUS.s,
  },
  watchedBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: BORDER_RADIUS.round,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
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
