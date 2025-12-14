import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import { CastSection } from '@/src/components/detail/CastSection';
import { CrewSection } from '@/src/components/detail/CrewSection';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RelatedEpisodesSection } from '@/src/components/detail/RelatedEpisodesSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import RatingButton from '@/src/components/RatingButton';
import RatingModal from '@/src/components/RatingModal';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import {
  useIsEpisodeWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { useMediaLists } from '@/src/hooks/useLists';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useEpisodeRating } from '@/src/hooks/useRatings';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Check, ChevronRight, Clock, Play, Star } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EpisodeDetailScreen() {
  const { id: tvIdStr, seasonNum: seasonStr, episodeNum: episodeStr } = useLocalSearchParams();
  const router = useRouter();
  const tvId = Number(tvIdStr);
  const seasonNumber = Number(seasonStr);
  const episodeNumber = Number(episodeStr);

  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);

  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const currentTab = useCurrentTab();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  const { userRating, isLoading: isLoadingRating } = useEpisodeRating(
    tvId,
    seasonNumber,
    episodeNumber
  );

  const { data: episodeTracking } = useShowEpisodeTracking(tvId);
  const { isWatched } = useIsEpisodeWatched(tvId, seasonNumber, episodeNumber);
  const markWatched = useMarkEpisodeWatched();
  const markUnwatched = useMarkEpisodeUnwatched();

  const { preferences } = usePreferences();
  const { membership: listMembership } = useMediaLists(tvId);

  const tvShowQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  const seasonQuery = useQuery({
    queryKey: ['tv', tvId, 'season', seasonNumber],
    queryFn: () => tmdbApi.getSeasonDetails(tvId, seasonNumber),
    enabled: !!tvId && !!seasonNumber,
  });

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

  const tvShow = tvShowQuery.data;
  const episode = episodeDetailsQuery.data;
  const season = seasonQuery.data;
  const credits = episodeCreditsQuery.data;
  const videos = episodeVideosQuery.data || [];
  const images = episodeImagesQuery.data;

  const isLoading = episodeDetailsQuery.isLoading || tvShowQuery.isLoading || seasonQuery.isLoading;

  const isError = episodeDetailsQuery.isError || tvShowQuery.isError || seasonQuery.isError;

  // Tab-aware navigation
  const navigateTo = useCallback(
    (path: string) => {
      if (currentTab) {
        router.push(`/(tabs)/${currentTab}${path}` as any);
      } else {
        router.push(path as any);
      }
    },
    [currentTab, router]
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
    requireAuth(() => {
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
          autoAddOptions: {
            showStatus: tvShow.status,
            shouldAutoAdd: preferences.autoAddToWatching,
            listMembership,
            firstAirDate: tvShow.first_air_date,
            voteAverage: tvShow.vote_average,
            genreIds: tvShow.genres?.map((g) => g.id) || [],
          },
        });
      }
    }, 'Sign in to track your watched episodes');
  }, [
    episode,
    tvShow,
    isWatched,
    markWatched,
    markUnwatched,
    tvId,
    seasonNumber,
    episodeNumber,
    requireAuth,
    preferences,
    listMembership,
  ]);

  const handleVideoPress = useCallback((video: Video) => {
    setSelectedVideo(video);
    setTrailerModalVisible(true);
  }, []);

  const handlePhotoPress = useCallback((index: number) => {
    setLightboxIndex(index);
    setLightboxVisible(true);
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
    ]);
    setRefreshing(false);
  }, [
    episodeDetailsQuery,
    episodeCreditsQuery,
    episodeVideosQuery,
    episodeImagesQuery,
    seasonQuery,
    tvShowQuery,
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

  const trailer = useMemo(() => {
    return videos.find((v) => v.type === 'Trailer' && v.site === 'YouTube');
  }, [videos]);

  const hasAired = useMemo(() => {
    if (!episode?.air_date) return false;
    return new Date(episode.air_date) <= new Date();
  }, [episode]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

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
  const headerSubtitle = `Season ${seasonNumber}, Episode ${episodeNumber}`;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={tvShow?.name || 'Loading...'}
        subtitle={headerSubtitle}
        onBackPress={handleBack}
        scrollY={scrollY}
      />

      <Animated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        {...scrollViewProps}
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
            {/* Episode Number */}
            <View style={styles.metaItem}>
              <Text style={[styles.metaText, { fontWeight: '600', color: COLORS.text }]}>
                S{seasonNumber} E{episodeNumber}
              </Text>
            </View>

            {episode.air_date && (
              <View style={styles.metaItem}>
                <Calendar size={16} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>
                  {new Date(episode.air_date).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
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
            <View style={styles.primaryActionsContainer}>
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

            {/* Rating Button */}
            <View style={detailStyles.ratingButtonContainer}>
              <RatingButton
                onPress={() =>
                  requireAuth(() => setRatingModalVisible(true), 'Sign in to rate episodes')
                }
                isRated={userRating > 0}
                isLoading={isLoadingRating}
              />
            </View>
          </View>

          {/* User Rating Display */}
          {userRating > 0 && <UserRating rating={userRating} />}

          {/* Overview */}
          {episode.overview && (
            <View style={styles.overviewSection}>
              <Text style={styles.sectionTitle}>Overview</Text>
              <ExpandableText
                text={episode.overview}
                style={[styles.overviewText, { marginBottom: SPACING.s }]}
                readMoreStyle={styles.readMore}
              />
            </View>
          )}

          <SectionSeparator />

          {/* Guest Cast Section */}
          {credits?.guest_stars && credits.guest_stars.length > 0 && (
            <>
              <CastSection
                cast={credits.guest_stars}
                onCastPress={handlePersonPress}
                title="Guest Stars"
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
              <VideosSection videos={videos} onVideoPress={handleVideoPress} />
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
              />
            </>
          )}
        </View>
      </Animated.ScrollView>

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

      {/* Rating Modal */}
      {episode && tvShow && (
        <RatingModal
          visible={ratingModalVisible}
          onClose={() => setRatingModalVisible(false)}
          episodeData={{
            tvShowId: tvId,
            seasonNumber,
            episodeNumber,
            episodeName: episode.name,
            tvShowName: tvShow.name,
            posterPath: tvShow.poster_path,
          }}
          initialRating={userRating}
          onRatingSuccess={() => {}}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
      )}
      <Toast ref={toastRef} />
      {AuthGuardModal}
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
    marginTop: SPACING.s,
    marginBottom: SPACING.l,
    alignItems: 'center',
  },
  primaryActionsContainer: {
    flex: 1,
    flexDirection: 'column',
    gap: SPACING.s,
  },
  watchButton: {
    width: '100%',
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
    width: '100%',
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
  overviewSection: {},
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
});
