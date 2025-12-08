import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import AddToListModal from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SeasonsSection } from '@/src/components/detail/SeasonsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import RatingButton from '@/src/components/RatingButton';
import RatingModal from '@/src/components/RatingModal';
import ReminderButton from '@/src/components/ReminderButton';
import TVReminderModal from '@/src/components/TVReminderModal';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { ShareButton } from '@/src/components/ui/ShareButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useMediaLists } from '@/src/hooks/useLists';
import { useNotificationPermissions } from '@/src/hooks/useNotificationPermissions';
import { useMediaRating } from '@/src/hooks/useRatings';
import {
  useCancelReminder,
  useCreateReminder,
  useMediaReminder,
  useUpdateReminder,
} from '@/src/hooks/useReminders';
import { NextEpisodeInfo, ReminderTiming, TVReminderFrequency } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import { hasEpisodeChanged, isReleaseToday } from '@/src/utils/reminderHelpers';
import { getNextUpcomingSeason } from '@/src/utils/seasonHelpers';
import { getSubsequentEpisode } from '@/src/utils/subsequentEpisodeHelpers';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Check,
  Globe,
  Layers,
  Play,
  Plus,
  Star,
  Tv,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const hasWatchProviders = (providers: any): boolean => {
  if (!providers) return false;
  return (
    (providers.flatrate && providers.flatrate.length > 0) ||
    (providers.rent && providers.rent.length > 0) ||
    (providers.buy && providers.buy.length > 0)
  );
};

export default function TVDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const tvId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [listModalVisible, setListModalVisible] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  const { membership, isLoading: isLoadingLists } = useMediaLists(tvId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(tvId, 'tv');
  const isInAnyList = Object.keys(membership).length > 0;

  // Reminder hooks
  const { reminder, hasReminder, isLoading: isLoadingReminder } = useMediaReminder(tvId, 'tv');
  const { requestPermission } = useNotificationPermissions();
  const createReminderMutation = useCreateReminder();
  const cancelReminderMutation = useCancelReminder();
  const updateReminderMutation = useUpdateReminder();

  const tvQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  const creditsQuery = useQuery({
    queryKey: ['tv', tvId, 'credits'],
    queryFn: () => tmdbApi.getTVCredits(tvId),
    enabled: !!tvId,
  });

  const videosQuery = useQuery({
    queryKey: ['tv', tvId, 'videos'],
    queryFn: () => tmdbApi.getTVVideos(tvId),
    enabled: !!tvId,
  });

  const similarQuery = useQuery({
    queryKey: ['tv', tvId, 'similar'],
    queryFn: () => tmdbApi.getSimilarTV(tvId),
    enabled: !!tvId,
  });

  const watchProvidersQuery = useQuery({
    queryKey: ['tv', tvId, 'watch-providers'],
    queryFn: () => tmdbApi.getTVWatchProviders(tvId),
    enabled: !!tvId,
  });

  const imagesQuery = useQuery({
    queryKey: ['tv', tvId, 'images'],
    queryFn: () => tmdbApi.getTVImages(tvId),
    enabled: !!tvId,
  });

  const reviewsQuery = useQuery({
    queryKey: ['tv', tvId, 'reviews'],
    queryFn: () => tmdbApi.getTVReviews(tvId),
    enabled: !!tvId && shouldLoadReviews,
  });

  const recommendationsQuery = useQuery({
    queryKey: ['tv', tvId, 'recommendations'],
    queryFn: () => tmdbApi.getRecommendedTV(tvId),
    enabled: !!tvId && shouldLoadRecommendations,
  });

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

  // Compute next episode info for reminders (must be before early returns)
  const nextEpisodeInfo = useMemo((): NextEpisodeInfo | null => {
    const show = tvQuery.data;
    if (!show?.next_episode_to_air?.air_date) return null;
    return {
      seasonNumber: show.next_episode_to_air.season_number,
      episodeNumber: show.next_episode_to_air.episode_number,
      episodeName: show.next_episode_to_air.name || 'TBA',
      airDate: show.next_episode_to_air.air_date,
    };
  }, [tvQuery.data]);

  // Compute next season premiere date (must be before early returns)
  const { nextSeasonAirDate, nextSeasonNumber } = useMemo(() => {
    return getNextUpcomingSeason(tvQuery.data?.seasons);
  }, [tvQuery.data]);

  // State for subsequent episode (used when current next episode airs today)
  const [subsequentEpisode, setSubsequentEpisode] = useState<NextEpisodeInfo | null>(null);
  const [isLoadingSubsequent, setIsLoadingSubsequent] = useState(false);

  // Fetch subsequent episode when current next episode airs today
  useEffect(() => {
    // Only fetch if we have a next episode and it airs today
    if (nextEpisodeInfo && isReleaseToday(nextEpisodeInfo.airDate)) {
      setIsLoadingSubsequent(true);
      getSubsequentEpisode(tvId, nextEpisodeInfo)
        .then(setSubsequentEpisode)
        .catch(() => setSubsequentEpisode(null))
        .finally(() => setIsLoadingSubsequent(false));
    } else {
      // Clear subsequent episode when not needed
      setSubsequentEpisode(null);
    }
  }, [tvId, nextEpisodeInfo]);

  // The effective episode to use for reminders:
  // If today's episode is airing, use subsequent episode (if available)
  const effectiveNextEpisode = useMemo(() => {
    if (nextEpisodeInfo && isReleaseToday(nextEpisodeInfo.airDate) && subsequentEpisode) {
      return subsequentEpisode;
    }
    return nextEpisodeInfo;
  }, [nextEpisodeInfo, subsequentEpisode]);

  // Reminder handlers (must be before early returns)
  const handleSetReminder = useCallback(
    async (
      timing: ReminderTiming,
      frequency: TVReminderFrequency,
      nextEpisode: NextEpisodeInfo | null
    ) => {
      const show = tvQuery.data;
      if (!show) return;

      const hasPermission = await requestPermission();
      if (!hasPermission) {
        toastRef.current?.show('Please enable notifications in settings');
        return;
      }

      const releaseDate = frequency === 'every_episode' ? nextEpisode?.airDate : nextSeasonAirDate;

      if (!releaseDate) {
        toastRef.current?.show('No upcoming date available');
        return;
      }

      if (hasReminder && reminder) {
        // Check if frequency or nextEpisode have changed
        const frequencyChanged = frequency !== reminder.tvFrequency;
        const episodeChanged = hasEpisodeChanged(reminder.nextEpisode, nextEpisode);

        if (frequencyChanged || episodeChanged) {
          // Frequency or episode data changed - cancel existing and create new reminder
          await cancelReminderMutation.mutateAsync(reminder.id);

          if (frequency === 'every_episode') {
            if (!nextEpisode) {
              toastRef.current?.show('No upcoming episode available');
              return;
            }
            await createReminderMutation.mutateAsync({
              mediaId: show.id,
              mediaType: 'tv',
              title: show.name,
              posterPath: show.poster_path,
              releaseDate,
              reminderTiming: timing,
              tvFrequency: frequency,
              nextEpisode,
            });
          } else {
            await createReminderMutation.mutateAsync({
              mediaId: show.id,
              mediaType: 'tv',
              title: show.name,
              posterPath: show.poster_path,
              releaseDate,
              reminderTiming: timing,
              tvFrequency: frequency,
              ...(nextEpisode && { nextEpisode }),
            });
          }
        } else {
          // Only timing changed - use simple update
          await updateReminderMutation.mutateAsync({
            reminderId: reminder.id,
            timing,
          });
        }
      } else if (frequency === 'every_episode') {
        // For episode reminders, nextEpisode is required
        if (!nextEpisode) {
          toastRef.current?.show('No upcoming episode available');
          return;
        }
        await createReminderMutation.mutateAsync({
          mediaId: show.id,
          mediaType: 'tv',
          title: show.name,
          posterPath: show.poster_path,
          releaseDate,
          reminderTiming: timing,
          tvFrequency: frequency,
          nextEpisode,
        });
      } else {
        // For season premiere reminders, nextEpisode is optional
        await createReminderMutation.mutateAsync({
          mediaId: show.id,
          mediaType: 'tv',
          title: show.name,
          posterPath: show.poster_path,
          releaseDate,
          reminderTiming: timing,
          tvFrequency: frequency,
          ...(nextEpisode && { nextEpisode }),
        });
      }
    },
    [
      tvQuery.data,
      requestPermission,
      hasReminder,
      reminder,
      cancelReminderMutation,
      updateReminderMutation,
      createReminderMutation,
      nextSeasonAirDate,
    ]
  );

  const handleCancelReminder = useCallback(async () => {
    if (reminder) {
      await cancelReminderMutation.mutateAsync(reminder.id);
    }
  }, [reminder, cancelReminderMutation]);

  if (tvQuery.isLoading) {
    return (
      <View style={detailStyles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (tvQuery.isError || !tvQuery.data) {
    return (
      <View style={detailStyles.errorContainer}>
        <Text style={detailStyles.errorText}>Failed to load TV show details</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={detailStyles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={detailStyles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const show = tvQuery.data;
  const cast = creditsQuery.data?.cast.slice(0, 10) || [];
  const creator = creditsQuery.data?.crew.find(
    (c) => c.job === 'Executive Producer' || c.job === 'Creator'
  );
  const videos = videosQuery.data || [];
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ||
    videos.find((v) => v.type === 'Trailer') ||
    videos[0];
  const similarShows = similarQuery.data?.results.slice(0, 10) || [];
  const watchProviders = watchProvidersQuery.data;
  const watchProvidersLink = watchProvidersQuery.data?.link;
  const images = imagesQuery.data;
  const reviews = reviewsQuery.data?.results.slice(0, 10) || [];
  const recommendations = recommendationsQuery.data?.results.slice(0, 10) || [];

  const backdropUrl = getImageUrl(show.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);
  const posterUrl = getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handleTrailerPress = () => {
    if (trailer) {
      setSelectedVideo(trailer);
      setTrailerModalVisible(true);
    }
  };

  const handleCastPress = (personId: number) => {
    navigateTo(`/person/${personId}`);
  };

  const handleShowPress = (id: number) => {
    navigateTo(`/tv/${id}`);
  };

  const handleSeasonsPress = (seasonNumber?: number) => {
    const path = `/tv/${tvId}/seasons${seasonNumber !== undefined ? `?season=${seasonNumber}` : ''}`;
    navigateTo(path);
  };

  const handleCastViewAll = () => {
    navigateTo(`/tv/${tvId}/cast?title=${encodeURIComponent(show.name)}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        tvQuery.refetch(),
        creditsQuery.refetch(),
        videosQuery.refetch(),
        similarQuery.refetch(),
        watchProvidersQuery.refetch(),
        imagesQuery.refetch(),
        ...(shouldLoadReviews ? [reviewsQuery.refetch()] : []),
        ...(shouldLoadRecommendations ? [recommendationsQuery.refetch()] : []),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <View style={detailStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader title={show.name} onBackPress={() => router.back()} scrollY={scrollY} />

      <Animated.ScrollView
        style={detailStyles.scrollView}
        bounces={true}
        {...scrollViewProps}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* Hero Section */}
        <View style={detailStyles.heroContainer}>
          <MediaImage
            source={{ uri: backdropUrl }}
            style={detailStyles.backdrop}
            contentFit="cover"
          />
          <LinearGradient
            colors={['transparent', COLORS.background]}
            style={detailStyles.gradient}
          />

          <SafeAreaView style={detailStyles.headerSafe} edges={['top']}>
            <TouchableOpacity
              style={detailStyles.headerButton}
              onPress={() => router.back()}
              activeOpacity={ACTIVE_OPACITY}
            >
              <ArrowLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
          </SafeAreaView>

          <ShareButton
            id={tvId}
            title={show.name}
            mediaType="tv"
            onShowToast={(msg) => toastRef.current?.show(msg)}
          />

          <View style={detailStyles.posterContainer}>
            <MediaImage
              source={{ uri: posterUrl }}
              style={detailStyles.poster}
              contentFit="cover"
            />
          </View>
        </View>

        {/* Content */}
        <View style={detailStyles.content}>
          <Text style={detailStyles.title}>{show.name}</Text>

          <View style={detailStyles.metaContainer}>
            <View style={detailStyles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={detailStyles.metaText}>
                {show.first_air_date
                  ? formatTmdbDate(show.first_air_date, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Unknown'}
              </Text>
            </View>
            <TouchableOpacity
              style={detailStyles.metaItem}
              onPress={() => handleSeasonsPress()}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Layers size={14} color={COLORS.primary} />
              <Text style={[detailStyles.metaText, { color: COLORS.primary }]}>
                {show.number_of_seasons} Seasons
              </Text>
            </TouchableOpacity>
            <View style={detailStyles.metaItem}>
              <Tv size={14} color={COLORS.textSecondary} />
              <Text style={detailStyles.metaText}>{show.number_of_episodes} Episodes</Text>
            </View>
            <View style={detailStyles.metaItem}>
              <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
              <Text style={[detailStyles.metaText, { color: COLORS.warning }]}>
                {show.vote_average.toFixed(1)}
              </Text>
            </View>
            {show.original_language !== 'en' && (
              <View style={detailStyles.metaItem}>
                <Globe size={14} color={COLORS.textSecondary} />
                <Text style={detailStyles.metaText}>{getLanguageName(show.original_language)}</Text>
              </View>
            )}
            {(show.status === 'Ended' || show.status === 'Canceled') && (
              <View style={detailStyles.statusBadge}>
                <Text style={detailStyles.statusBadgeText}>{show.status}</Text>
              </View>
            )}
          </View>

          <View style={detailStyles.genresContainer}>
            {show.genres.map((genre) => (
              <View key={genre.id} style={detailStyles.genreTag}>
                <Text style={detailStyles.genreText}>{genre.name}</Text>
              </View>
            ))}
          </View>

          {/* Action buttons */}
          <View style={detailStyles.actionButtons}>
            <TouchableOpacity
              style={[detailStyles.playButton, !trailer && detailStyles.disabledButton]}
              onPress={handleTrailerPress}
              disabled={!trailer}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Play size={18} color={COLORS.white} fill={COLORS.white} />
              <Text style={detailStyles.playButtonText}>Watch Trailer</Text>
            </TouchableOpacity>

            {/* Add to List Button */}
            <TouchableOpacity
              style={[detailStyles.addButton, isInAnyList && detailStyles.addedButton]}
              activeOpacity={ACTIVE_OPACITY}
              onPress={() =>
                requireAuth(() => setListModalVisible(true), 'Sign in to add items to your lists')
              }
              disabled={isLoadingLists}
            >
              {isLoadingLists ? (
                <ActivityIndicator size="small" color={COLORS.white} />
              ) : isInAnyList ? (
                <Check size={24} color={COLORS.white} />
              ) : (
                <Plus size={24} color={COLORS.white} />
              )}
            </TouchableOpacity>

            {/* Rating Button */}
            <View style={detailStyles.ratingButtonContainer}>
              <RatingButton
                onPress={() =>
                  requireAuth(() => setRatingModalVisible(true), 'Sign in to rate movies and shows')
                }
                isRated={userRating > 0}
                isLoading={isLoadingRating}
              />
            </View>

            {/* Reminder Button */}
            {show.status === 'Returning Series' && (
              <View style={detailStyles.ratingButtonContainer}>
                <ReminderButton
                  onPress={() =>
                    requireAuth(
                      () => setReminderModalVisible(true),
                      'Sign in to set release reminders'
                    )
                  }
                  hasReminder={hasReminder}
                  isLoading={isLoadingReminder}
                />
              </View>
            )}
          </View>

          {userRating > 0 && <UserRating rating={userRating} />}

          <Text style={detailStyles.sectionTitle}>Overview</Text>
          <ExpandableText
            text={show.overview || 'No overview available'}
            style={detailStyles.overview}
            readMoreStyle={detailStyles.readMore}
          />

          <SectionSeparator />

          {/* Seasons Section */}
          {show.seasons && show.seasons.some((s) => s.season_number > 0) && (
            <>
              <SeasonsSection
                tvShowId={tvId}
                seasons={show.seasons.filter((s) => s.season_number > 0)}
                onSeasonPress={handleSeasonsPress}
              />
              <SectionSeparator />
            </>
          )}

          {creator && (
            <View style={detailStyles.directorContainer}>
              <Text style={detailStyles.label}>Creator: </Text>
              <TouchableOpacity
                onPress={() => navigateTo(`/person/${creator.id}`)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[detailStyles.value, { color: COLORS.primary }]}>{creator.name}</Text>
              </TouchableOpacity>
            </View>
          )}

          {creator && <SectionSeparator />}

          {/* Watch Providers */}
          <WatchProvidersSection watchProviders={watchProviders} link={watchProvidersLink} />

          {hasWatchProviders(watchProviders) && <SectionSeparator />}

          {/* Cast */}
          <CastSection cast={cast} onCastPress={handleCastPress} onViewAll={handleCastViewAll} />

          {cast.length > 0 && <SectionSeparator />}

          {/* Similar Shows */}
          <SimilarMediaSection
            mediaType="tv"
            items={similarShows}
            onMediaPress={handleShowPress}
            title="Similar Shows"
          />

          {similarShows.length > 0 && <SectionSeparator />}

          {/* Photos */}
          {images && images.backdrops && images.backdrops.length > 0 && (
            <PhotosSection
              images={images.backdrops}
              onPhotoPress={(index) => {
                setLightboxIndex(index);
                setLightboxVisible(true);
              }}
            />
          )}

          {images && images.backdrops && images.backdrops.length > 0 && <SectionSeparator />}

          {/* Videos */}
          <VideosSection
            videos={videos}
            onVideoPress={(video) => {
              setSelectedVideo(video);
              setTrailerModalVisible(true);
            }}
          />

          {videos.length > 0 && <SectionSeparator />}

          {/* Recommendations */}
          <RecommendationsSection
            mediaType="tv"
            items={recommendations}
            isLoading={recommendationsQuery.isLoading}
            isError={recommendationsQuery.isError}
            shouldLoad={shouldLoadRecommendations}
            onMediaPress={handleShowPress}
            onLayout={() => {
              if (!shouldLoadRecommendations) {
                setShouldLoadRecommendations(true);
              }
            }}
          />

          {recommendations.length > 0 && <SectionSeparator />}

          {/* Reviews */}
          <ReviewsSection
            isLoading={reviewsQuery.isLoading}
            isError={reviewsQuery.isError}
            reviews={reviews}
            shouldLoad={shouldLoadReviews}
            onReviewPress={(review) => {
              navigateTo(
                `/review/${review.id}?review=${encodeURIComponent(JSON.stringify(review))}`
              );
            }}
            onLayout={() => {
              if (!shouldLoadReviews) {
                setShouldLoadReviews(true);
              }
            }}
          />

          {!reviewsQuery.isLoading && !reviewsQuery.isError && reviews.length > 0 && (
            <SectionSeparator />
          )}

          {/* Details */}
          <MediaDetailsInfo media={show} type="tv" />
        </View>
      </Animated.ScrollView>

      <TrailerPlayer
        visible={trailerModalVisible}
        onClose={() => setTrailerModalVisible(false)}
        videoKey={selectedVideo?.key || trailer?.key || null}
      />

      <ImageLightbox
        visible={lightboxVisible}
        onClose={() => setLightboxVisible(false)}
        images={
          images?.backdrops
            .slice(0, 10)
            .map((img) => getImageUrl(img.file_path, TMDB_IMAGE_SIZES.backdrop.large) || '') || []
        }
        initialIndex={lightboxIndex}
      />

      {show && (
        <>
          <AddToListModal
            visible={listModalVisible}
            onClose={() => setListModalVisible(false)}
            mediaItem={{
              id: show.id,
              title: show.name,
              poster_path: show.poster_path,
              media_type: 'tv',
              vote_average: show.vote_average,
              release_date: show.first_air_date,
              genre_ids: show.genres?.map((g) => g.id) || [],
            }}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <RatingModal
            visible={ratingModalVisible}
            onClose={() => setRatingModalVisible(false)}
            mediaId={show.id}
            mediaType="tv"
            initialRating={userRating}
            onRatingSuccess={() => {}}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <TVReminderModal
            visible={reminderModalVisible}
            onClose={() => setReminderModalVisible(false)}
            tvId={show.id}
            tvTitle={show.name}
            nextEpisode={effectiveNextEpisode}
            originalNextEpisode={nextEpisodeInfo}
            isUsingSubsequentEpisode={
              !!(nextEpisodeInfo && isReleaseToday(nextEpisodeInfo.airDate) && subsequentEpisode)
            }
            isLoadingSubsequentEpisode={isLoadingSubsequent}
            nextSeasonAirDate={nextSeasonAirDate}
            nextSeasonNumber={nextSeasonNumber}
            currentTiming={reminder?.reminderTiming}
            currentFrequency={reminder?.tvFrequency}
            currentNextEpisode={reminder?.nextEpisode}
            hasReminder={hasReminder}
            onSetReminder={handleSetReminder}
            onCancelReminder={handleCancelReminder}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
        </>
      )}
      <Toast ref={toastRef} />
      {AuthGuardModal}
    </View>
  );
}
