import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { CreatorsSection } from '@/src/components/detail/CreatorsSection';
import { DetailScreenSkeleton } from '@/src/components/detail/DetailScreenSkeleton';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { MediaActionButtons } from '@/src/components/detail/MediaActionButtons';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SeasonsSection } from '@/src/components/detail/SeasonsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { TraktReviewsSection } from '@/src/components/detail/TraktReviewsSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import RatingModal from '@/src/components/RatingModal';
import TVReminderModal from '@/src/components/TVReminderModal';
import { AnimatedScrollHeader } from '@/src/components/ui/AnimatedScrollHeader';
import { BlurredText } from '@/src/components/ui/BlurredText';
import { ExpandableText } from '@/src/components/ui/ExpandableText';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { ShareButton } from '@/src/components/ui/ShareButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useCurrentTab } from '@/src/context/TabContext';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useMediaLists } from '@/src/hooks/useLists';
import { useMediaNote } from '@/src/hooks/useNotes';
import { useNotificationPermissions } from '@/src/hooks/useNotificationPermissions';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useMediaRating } from '@/src/hooks/useRatings';
import {
  useCancelReminder,
  useCreateReminder,
  useMediaReminder,
  useUpdateReminder,
} from '@/src/hooks/useReminders';
import { useTraktReviews } from '@/src/hooks/useTraktReviews';
import { NextEpisodeInfo, ReminderTiming, TVReminderFrequency } from '@/src/types/reminder';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import { hasWatchProviders } from '@/src/utils/mediaUtils';
import { showPremiumAlert } from '@/src/utils/premiumAlert';
import { hasEpisodeChanged, isReleaseToday } from '@/src/utils/reminderHelpers';
import { getNextUpcomingSeason } from '@/src/utils/seasonHelpers';
import { getSubsequentEpisode } from '@/src/utils/subsequentEpisodeHelpers';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Globe, Layers, Star, Tv } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TVDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const tvId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const noteSheetRef = useRef<NoteModalRef>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadTraktReviews, setShouldLoadTraktReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { requireAuth, AuthGuardModal } = useAuthGuard();
  const { isPremium } = usePremium();

  const { membership, isLoading: isLoadingLists } = useMediaLists(tvId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(tvId, 'tv');
  const { preferences } = usePreferences();
  const isInAnyList = Object.keys(membership).length > 0;

  // Reminder hooks
  const { reminder, hasReminder, isLoading: isLoadingReminder } = useMediaReminder(tvId, 'tv');
  const { note, hasNote, isLoading: isLoadingNote } = useMediaNote('tv', tvId);
  const { requestPermission } = useNotificationPermissions();
  const createReminderMutation = useCreateReminder();
  const cancelReminderMutation = useCancelReminder();
  const updateReminderMutation = useUpdateReminder();

  // Trakt reviews
  const {
    reviews: traktReviews,
    isLoading: isLoadingTraktReviews,
    isError: isTraktReviewsError,
  } = useTraktReviews(tvId, 'tv', shouldLoadTraktReviews);

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

    // If we have next_episode_to_air, use it
    if (show?.next_episode_to_air?.air_date) {
      return {
        seasonNumber: show.next_episode_to_air.season_number,
        episodeNumber: show.next_episode_to_air.episode_number,
        episodeName: show.next_episode_to_air.name || 'TBA',
        airDate: show.next_episode_to_air.air_date,
      };
    }

    // Fallback: Use first_air_date for series premiere (S1E1)
    // Only when: show is in pre-air status OR first_air_date is in the future
    if (show?.first_air_date) {
      const preAirStatuses = ['Planned', 'Pilot', 'In Production'];
      const isPreAirStatus = preAirStatuses.includes(show.status || '');

      // Check if first_air_date is today or in the future
      const firstAirDate = new Date(show.first_air_date + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const isFirstAirDateFuture = firstAirDate >= today;

      if (isPreAirStatus || isFirstAirDateFuture) {
        return {
          seasonNumber: 1,
          episodeNumber: 1,
          episodeName: 'Series Premiere',
          airDate: show.first_air_date,
        };
      }
    }

    return null;
  }, [tvQuery.data]);

  // Compute next season premiere date (must be before early returns)
  const { nextSeasonAirDate, nextSeasonNumber } = useMemo(() => {
    return getNextUpcomingSeason(tvQuery.data?.seasons);
  }, [tvQuery.data]);

  // Fetch subsequent episode when current next episode airs today
  const subsequentEpisodeQuery = useQuery({
    queryKey: [
      'tv',
      tvId,
      'subsequent-episode',
      nextEpisodeInfo?.seasonNumber,
      nextEpisodeInfo?.episodeNumber,
    ],
    queryFn: () => getSubsequentEpisode(tvId, nextEpisodeInfo!),
    enabled: !!(nextEpisodeInfo?.airDate && isReleaseToday(nextEpisodeInfo.airDate)),
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 2,
  });

  const subsequentEpisode = subsequentEpisodeQuery.data ?? null;
  const isLoadingSubsequent = subsequentEpisodeQuery.isLoading;

  // Whether we should use the subsequent episode instead of the current next episode
  const isUsingSubsequent = useMemo(() => {
    return !!(nextEpisodeInfo && isReleaseToday(nextEpisodeInfo.airDate) && subsequentEpisode);
  }, [nextEpisodeInfo, subsequentEpisode]);

  // The effective episode to use for reminders:
  // If today's episode is airing, use subsequent episode (if available)
  const effectiveNextEpisode = useMemo(() => {
    if (isUsingSubsequent) {
      return subsequentEpisode;
    }
    return nextEpisodeInfo;
  }, [nextEpisodeInfo, subsequentEpisode, isUsingSubsequent]);

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

  // Progressive rendering: defer heavy component tree by one tick on cache hit
  const { isReady } = useProgressiveRender();

  if (!isReady || tvQuery.isLoading) {
    return <DetailScreenSkeleton />;
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
  const creators = show.created_by || [];
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
  const rawRecommendations = recommendationsQuery.data?.results.slice(0, 10) || [];

  // Filter out watched content
  const filteredSimilarShows = useContentFilter(similarShows);
  const recommendations = useContentFilter(rawRecommendations);

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
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={async () => {
              await Clipboard.setStringAsync(show.name);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toastRef.current?.show('Title copied to clipboard');
            }}
          >
            <Text style={detailStyles.title}>{show.name}</Text>
          </TouchableOpacity>

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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -SPACING.l }}
            contentContainerStyle={{ paddingHorizontal: SPACING.l }}
          >
            <View style={detailStyles.genresContainer}>
              {show.genres.map((genre) => (
                <View key={genre.id} style={detailStyles.genreTag}>
                  <Text style={detailStyles.genreText}>{genre.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Action buttons */}
          <MediaActionButtons
            onAddToList={() =>
              requireAuth(
                () => addToListModalRef.current?.present(),
                'Sign in to add items to your lists'
              )
            }
            onRate={() =>
              requireAuth(() => setRatingModalVisible(true), 'Sign in to rate movies and shows')
            }
            onReminder={
              show.status === 'Returning Series' ||
              show.status === 'In Production' ||
              show.status === 'Planned' ||
              show.status === 'Pilot'
                ? () =>
                    requireAuth(() => {
                      if (!isPremium) {
                        showPremiumAlert('Reminders');
                        return;
                      }
                      setReminderModalVisible(true);
                    }, 'Sign in to set release reminders')
                : undefined
            }
            onNote={() =>
              requireAuth(
                () =>
                  noteSheetRef.current?.present({
                    mediaType: 'tv',
                    mediaId: tvId,
                    posterPath: show.poster_path,
                    mediaTitle: show.name,
                    initialNote: note?.content,
                  }),
                'Sign in to add notes'
              )
            }
            onTrailer={handleTrailerPress}
            isInAnyList={isInAnyList}
            isLoadingLists={isLoadingLists}
            userRating={userRating}
            isLoadingRating={isLoadingRating}
            hasReminder={hasReminder}
            isLoadingReminder={isLoadingReminder}
            hasNote={hasNote}
            isLoadingNote={isLoadingNote}
            hasTrailer={!!trailer}
          />

          {userRating > 0 && <UserRating rating={userRating} />}

          <Text style={detailStyles.sectionTitle}>Overview</Text>
          {preferences?.blurPlotSpoilers ? (
            <BlurredText
              text={show.overview || 'No overview available'}
              style={detailStyles.overview}
              readMoreStyle={detailStyles.readMore}
              isBlurred={true}
            />
          ) : (
            <ExpandableText
              text={show.overview || 'No overview available'}
              style={detailStyles.overview}
              readMoreStyle={detailStyles.readMore}
            />
          )}

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

          {/* Creators Section */}
          <CreatorsSection
            creators={creators}
            onCreatorPress={(id) => navigateTo(`/person/${id}`)}
          />

          {creators.length > 0 && <SectionSeparator />}

          {/* Watch Providers */}
          <WatchProvidersSection watchProviders={watchProviders} link={watchProvidersLink} />

          {hasWatchProviders(watchProviders) && <SectionSeparator />}

          {/* Cast */}
          <CastSection cast={cast} onCastPress={handleCastPress} onViewAll={handleCastViewAll} />

          {cast.length > 0 && <SectionSeparator />}

          {/* Similar Shows */}
          <SimilarMediaSection
            mediaType="tv"
            items={filteredSimilarShows}
            onMediaPress={handleShowPress}
            title="Similar Shows"
          />

          {filteredSimilarShows.length > 0 && <SectionSeparator />}

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

          {/* Trakt Reviews */}
          <TraktReviewsSection
            isLoading={isLoadingTraktReviews}
            isError={isTraktReviewsError}
            reviews={traktReviews}
            shouldLoad={shouldLoadTraktReviews}
            onReviewPress={(review) => {
              navigateTo(
                `/review/${review.id}?review=${encodeURIComponent(JSON.stringify(review))}`
              );
            }}
            onLayout={() => {
              if (!shouldLoadTraktReviews) {
                setShouldLoadTraktReviews(true);
              }
            }}
          />

          {!isLoadingTraktReviews && !isTraktReviewsError && traktReviews.length > 0 && (
            <SectionSeparator />
          )}

          {/* TMDB Reviews */}
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
            ref={addToListModalRef}
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
            tvTitle={show.name}
            nextEpisode={effectiveNextEpisode}
            originalNextEpisode={nextEpisodeInfo}
            isUsingSubsequentEpisode={isUsingSubsequent}
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
          <NoteModal ref={noteSheetRef} />
        </>
      )}
      <Toast ref={toastRef} />
      {AuthGuardModal}
    </View>
  );
}
