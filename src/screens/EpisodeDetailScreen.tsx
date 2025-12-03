import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  MAX_CHARACTERS,
  SPACING,
} from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import { CastSection } from '@/src/components/detail/CastSection';
import { CrewSection } from '@/src/components/detail/CrewSection';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RelatedEpisodesSection } from '@/src/components/detail/RelatedEpisodesSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import {
  useIsEpisodeWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Play,
  Star,
} from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EpisodeDetailScreen() {
  const { id: tvIdStr, seasonNum: seasonStr, episodeNum: episodeStr } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const tvId = Number(tvIdStr);
  const seasonNumber = Number(seasonStr);
  const episodeNumber = Number(episodeStr);

  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);

  // Episode tracking (Firestore)
  const { data: episodeTracking } = useShowEpisodeTracking(tvId);
  const { isWatched } = useIsEpisodeWatched(tvId, seasonNumber, episodeNumber);
  const markWatched = useMarkEpisodeWatched();
  const markUnwatched = useMarkEpisodeUnwatched();

  // TV show data for metadata
  const tvShowQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  // Season data for related episodes
  const seasonQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber],
    queryFn: () => tmdbApi.getSeasonDetails(tvId, seasonNumber),
    enabled: !!tvId && !!seasonNumber,
  });

  // Episode details queries
  const episodeDetailsQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'details'],
    queryFn: () => tmdbApi.getEpisodeDetails(tvId, seasonNumber, episodeNumber),
    enabled: !!tvId && !!seasonNumber && !!episodeNumber,
  });

  const episodeCreditsQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'credits'],
    queryFn: () => tmdbApi.getEpisodeCredits(tvId, seasonNumber, episodeNumber),
    enabled: !!tvId && !!seasonNumber && !!episodeNumber,
  });

  const episodeVideosQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'videos'],
    queryFn: () => tmdbApi.getEpisodeVideos(tvId, seasonNumber, episodeNumber),
    enabled: !!tvId && !!seasonNumber && !!episodeNumber,
  });

  const episodeImagesQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'images'],
    queryFn: () => tmdbApi.getEpisodeImages(tvId, seasonNumber, episodeNumber),
    enabled: !!tvId && !!seasonNumber && !!episodeNumber,
  });

  const episodeReviewsQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber, 'episode', episodeNumber, 'reviews'],
    queryFn: () => tmdbApi.getEpisodeReviews(tvId, seasonNumber, episodeNumber),
    enabled: shouldLoadReviews && !!tvId && !!seasonNumber && !!episodeNumber,
  });

  const tvShow = tvShowQuery.data;
  const episode = episodeDetailsQuery.data;
  const season = seasonQuery.data;
  const credits = episodeCreditsQuery.data;
  const videos = episodeVideosQuery.data || [];
  const images = episodeImagesQuery.data;
  const reviews = episodeReviewsQuery.data;

  const isLoading = episodeDetailsQuery.isLoading || tvShowQuery.isLoading || seasonQuery.isLoading;

  const isError = episodeDetailsQuery.isError || tvShowQuery.isError || seasonQuery.isError;

  // Tab-aware navigation
  const navigateTo = useCallback(
    (path: string) => {
      const currentTab = segments[1];
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}${path}` as any);
      } else {
        router.push(path as any);
      }
    },
    [router, segments]
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTVShowPress = useCallback(() => {
    navigateTo(`/tv/${tvId}`);
  }, [navigateTo, tvId]);

  const handlePersonPress = useCallback(
    (personId: number) => {
      navigateTo(`/person/${personId}`);
    },
    [navigateTo]
  );

  const handleRelatedEpisodePress = useCallback(
    (episodeNum: number) => {
      navigateTo(`/tv/${tvId}/season/${seasonNumber}/episode/${episodeNum}`);
    },
    [navigateTo, tvId, seasonNumber]
  );

  const handleMarkWatched = useCallback(() => {
    if (!episode || !tvShow) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isWatched) {
      markUnwatched.mutate({
        tvShowId: tvId,
        seasonNumber,
        episodeNumber,
      });
    } else {
      markWatched.mutate({
        tvShowId: tvId,
        seasonNumber,
        episodeNumber,
        episodeData: {
          episodeId: episode.id,
          episodeName: episode.name,
          episodeAirDate: episode.air_date,
        },
        showMetadata: {
          tvShowName: tvShow.name,
          posterPath: tvShow.poster_path,
        },
      });
    }
  }, [episode, tvShow, isWatched, markWatched, markUnwatched, tvId, seasonNumber, episodeNumber]);

  const handleVideoPress = useCallback((video: Video) => {
    setSelectedVideo(video);
    setTrailerModalVisible(true);
  }, []);

  const handlePhotoPress = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
  }, []);

  const handleReviewPress = useCallback((review: any) => {
    // Could navigate to review detail screen if implemented
    console.log('Review pressed:', review.id);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([
      episodeDetailsQuery.refetch(),
      episodeCreditsQuery.refetch(),
      episodeVideosQuery.refetch(),
      episodeImagesQuery.refetch(),
      seasonQuery.refetch(),
      tvShowQuery.refetch(),
      ...(shouldLoadReviews ? [episodeReviewsQuery.refetch()] : []),
    ]);
    setRefreshing(false);
  }, [
    episodeDetailsQuery,
    episodeCreditsQuery,
    episodeVideosQuery,
    episodeImagesQuery,
    seasonQuery,
    tvShowQuery,
    episodeReviewsQuery,
    shouldLoadReviews,
  ]);

  // Calculate watched episodes for related episodes section
  const watchedEpisodesMap = useMemo(() => {
    if (!episodeTracking?.episodes) return {};
    const map: Record<string, boolean> = {};
    Object.keys(episodeTracking.episodes).forEach((key) => {
      map[key] = true;
    });
    return map;
  }, [episodeTracking]);

  // Trailer for "Play Trailer" button
  const trailer = useMemo(() => {
    return videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  }, [videos]);

  // Check if episode has aired
  const hasAired = useMemo(() => {
    if (!episode?.air_date) return false;
    return new Date(episode.air_date) <= new Date();
  }, [episode]);

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  // Error state
  if (isError || !episode) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>Failed to load episode details</Text>
        <TouchableOpacity style={styles.errorButton} onPress={handleBack}>
          <Text style={styles.errorButtonText}>Go Back</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const stillUrl = getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.large);
  const isPending = markWatched.isPending || markUnwatched.isPending;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Hero Section */}
        <View style={detailStyles.episodeHeroContainer}>
          <MediaImage source={{ uri: stillUrl }} style={styles.heroImage} contentFit="cover" />
          <LinearGradient colors={['transparent', COLORS.background]} style={styles.heroGradient} />

          {/* Back Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBack}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={24} color={COLORS.text} />
          </TouchableOpacity>

          {/* Episode Number Badge */}
          <View style={detailStyles.episodeNumberBadge}>
            <Text style={detailStyles.episodeNumberText}>
              S{seasonNumber} E{episodeNumber}
            </Text>
          </View>
        </View>

        {/* Content Section */}
        <View style={styles.content}>
          {/* Breadcrumb Navigation */}
          <View style={detailStyles.episodeBreadcrumb}>
            <TouchableOpacity onPress={handleTVShowPress} activeOpacity={ACTIVE_OPACITY}>
              <Text style={detailStyles.episodeBreadcrumbLink}>{tvShow?.name}</Text>
            </TouchableOpacity>
            <ChevronRight size={14} color={COLORS.textSecondary} />
            <TouchableOpacity onPress={handleBack} activeOpacity={ACTIVE_OPACITY}>
              <Text style={detailStyles.episodeBreadcrumbLink}>
                {season?.name || `Season ${seasonNumber}`}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Episode Title */}
          <Text style={styles.title}>{episode.name}</Text>

          {/* Meta Information */}
          <View style={styles.metaRow}>
            {episode.air_date && (
              <View style={styles.metaItem}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  {new Date(episode.air_date).toLocaleDateString()}
                </Text>
              </View>
            )}
            {episode.runtime && (
              <View style={styles.metaItem}>
                <Clock size={16} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{episode.runtime}m</Text>
              </View>
            )}
            {episode.vote_average > 0 && (
              <View style={styles.metaItem}>
                <Star size={16} color={COLORS.warning} fill={COLORS.warning} />
                <Text style={[styles.metaText, { color: COLORS.warning }]}>
                  {episode.vote_average.toFixed(1)}
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[
                styles.watchButton,
                isWatched && styles.unwatchButton,
                (!hasAired || isPending) && styles.disabledButton,
              ]}
              onPress={handleMarkWatched}
              disabled={!hasAired || isPending}
              activeOpacity={ACTIVE_OPACITY}
            >
              {isPending ? (
                <ActivityIndicator size="small" color={COLORS.text} />
              ) : (
                <>
                  <Check size={20} color={COLORS.text} />
                  <Text style={styles.watchButtonText}>
                    {isWatched ? 'Mark as Unwatched' : 'Mark as Watched'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            {trailer && (
              <TouchableOpacity
                style={styles.trailerButton}
                onPress={() => handleVideoPress(trailer)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Play size={20} color={COLORS.text} fill={COLORS.text} />
                <Text style={styles.trailerButtonText}>Play Trailer</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Overview */}
          {episode.overview && (
            <View style={styles.overviewSection}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <Text style={styles.overviewText} numberOfLines={overviewExpanded ? undefined : 4}>
                {episode.overview}
              </Text>
              {episode.overview.length > MAX_CHARACTERS && (
                <TouchableOpacity
                  onPress={() => setOverviewExpanded(!overviewExpanded)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <Text style={styles.readMore}>
                    {overviewExpanded ? 'Read less' : 'Read more'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Director & Writer */}
          {credits?.crew && (
            <View style={styles.crewInline}>
              {credits.crew.find((c) => c.job === 'Director') && (
                <View style={styles.crewInlineItem}>
                  <Text style={styles.crewInlineLabel}>Director</Text>
                  <TouchableOpacity
                    onPress={() =>
                      handlePersonPress(credits.crew.find((c) => c.job === 'Director')!.id)
                    }
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <Text style={styles.crewInlineName}>
                      {credits.crew.find((c) => c.job === 'Director')!.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
              {credits.crew.find((c) => c.job === 'Writer' || c.job === 'Screenplay') && (
                <View style={styles.crewInlineItem}>
                  <Text style={styles.crewInlineLabel}>Writer</Text>
                  <TouchableOpacity
                    onPress={() =>
                      handlePersonPress(
                        credits.crew.find((c) => c.job === 'Writer' || c.job === 'Screenplay')!.id
                      )
                    }
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <Text style={styles.crewInlineName}>
                      {credits.crew.find((c) => c.job === 'Writer' || c.job === 'Screenplay')!.name}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <SectionSeparator />

          {/* Guest Cast Section */}
          {credits?.guest_stars && credits.guest_stars.length > 0 && (
            <>
              <CastSection
                cast={credits.guest_stars}
                onCastPress={handlePersonPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Crew Section */}
          {credits?.crew && credits.crew.length > 0 && (
            <>
              <CrewSection
                crew={credits.crew}
                onCrewPress={handlePersonPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Episode Stills */}
          {images?.stills && images.stills.length > 0 && (
            <>
              <PhotosSection
                images={images.stills}
                onPhotoPress={handlePhotoPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Videos Section */}
          {videos.length > 0 && (
            <>
              <VideosSection
                videos={videos}
                onVideoPress={handleVideoPress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Related Episodes */}
          {season?.episodes && (
            <>
              <RelatedEpisodesSection
                episodes={season.episodes}
                currentEpisodeNumber={episodeNumber}
                seasonNumber={seasonNumber}
                tvId={tvId}
                watchedEpisodes={watchedEpisodesMap}
                onEpisodePress={handleRelatedEpisodePress}
                style={{ marginTop: SPACING.l }}
              />
              <SectionSeparator />
            </>
          )}

          {/* Reviews Section (Lazy Loaded) */}
          <ReviewsSection
            isLoading={episodeReviewsQuery.isLoading}
            isError={episodeReviewsQuery.isError}
            reviews={reviews?.results || []}
            shouldLoad={shouldLoadReviews}
            onReviewPress={handleReviewPress}
            onLayout={() => {
              if (!shouldLoadReviews) {
                setShouldLoadReviews(true);
              }
            }}
            style={{ marginTop: SPACING.l }}
          />
        </View>
      </ScrollView>

      {/* Modals */}
      <TrailerPlayer
        visible={trailerModalVisible}
        videoKey={selectedVideo?.key || ''}
        onClose={() => {
          setTrailerModalVisible(false);
          setSelectedVideo(null);
        }}
      />

      <ImageLightbox
        visible={lightboxVisible}
        images={(images?.stills || [])
          .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.backdrop.original))
          .filter((url): url is string => url !== null)}
        initialIndex={lightboxIndex}
        onClose={() => setLightboxVisible(false)}
      />

      <Toast ref={toastRef} />
    </SafeAreaView>
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
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.l,
  },
  errorButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.xl,
    borderRadius: BORDER_RADIUS.m,
  },
  errorButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  heroImage: {
    width: '100%',
    height: 300,
    backgroundColor: COLORS.surfaceLight,
  },
  heroGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 150,
  },
  backButton: {
    position: 'absolute',
    top: SPACING.m,
    left: SPACING.m,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.s,
  },
  content: {
    padding: SPACING.l,
  },
  title: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.m,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  metaText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginTop: SPACING.l,
    marginBottom: SPACING.l,
  },
  watchButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
  },
  unwatchButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  disabledButton: {
    opacity: 0.5,
  },
  watchButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  trailerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.xs,
    backgroundColor: COLORS.surfaceLight,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.l,
    borderRadius: BORDER_RADIUS.m,
  },
  trailerButtonText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontWeight: '600',
  },
  overviewSection: {
    marginBottom: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: SPACING.s,
  },
  overviewText: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    lineHeight: 24,
  },
  readMore: {
    fontSize: FONT_SIZE.m,
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  crewInline: {
    marginBottom: SPACING.l,
  },
  crewInlineItem: {
    marginBottom: SPACING.s,
  },
  crewInlineLabel: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  crewInlineName: {
    fontSize: FONT_SIZE.m,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
