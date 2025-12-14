import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { CollectionSection } from '@/src/components/detail/CollectionSection';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { DirectorsSection } from '@/src/components/detail/DirectorsSection';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import RatingButton from '@/src/components/RatingButton';
import RatingModal from '@/src/components/RatingModal';
import ReminderButton from '@/src/components/ReminderButton';
import ReminderModal from '@/src/components/ReminderModal';
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
import { ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Check, Clock, Globe, Play, Plus, Star } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
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

// Check if a movie can have a reminder (has a future release date)
const canShowReminder = (releaseDate: string | null | undefined): boolean => {
  if (!releaseDate) return false;

  const release = parseTmdbDate(releaseDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return release >= today;
};

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const movieId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const addToListModalRef = useRef<AddToListModalRef>(null);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [reminderModalVisible, setReminderModalVisible] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const [shouldLoadCollections, setShouldLoadCollections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  const { membership, isLoading: isLoadingLists } = useMediaLists(movieId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(movieId, 'movie');
  const isInAnyList = Object.keys(membership).length > 0;

  const {
    reminder,
    hasReminder,
    isLoading: isLoadingReminder,
  } = useMediaReminder(movieId, 'movie');
  const { requestPermission } = useNotificationPermissions();
  const createReminderMutation = useCreateReminder();
  const cancelReminderMutation = useCancelReminder();
  const updateReminderMutation = useUpdateReminder();

  const movieQuery = useQuery({
    queryKey: ['movie', movieId],
    queryFn: () => tmdbApi.getMovieDetails(movieId),
    enabled: !!movieId,
  });

  const creditsQuery = useQuery({
    queryKey: ['movie', movieId, 'credits'],
    queryFn: () => tmdbApi.getMovieCredits(movieId),
    enabled: !!movieId,
  });

  const videosQuery = useQuery({
    queryKey: ['movie', movieId, 'videos'],
    queryFn: () => tmdbApi.getMovieVideos(movieId),
    enabled: !!movieId,
  });

  const similarQuery = useQuery({
    queryKey: ['movie', movieId, 'similar'],
    queryFn: () => tmdbApi.getSimilarMovies(movieId),
    enabled: !!movieId,
  });

  const watchProvidersQuery = useQuery({
    queryKey: ['movie', movieId, 'watch-providers'],
    queryFn: () => tmdbApi.getMovieWatchProviders(movieId),
    enabled: !!movieId,
  });

  const imagesQuery = useQuery({
    queryKey: ['movie', movieId, 'images'],
    queryFn: () => tmdbApi.getMovieImages(movieId),
    enabled: !!movieId,
  });

  const reviewsQuery = useQuery({
    queryKey: ['movie', movieId, 'reviews'],
    queryFn: () => tmdbApi.getMovieReviews(movieId),
    enabled: !!movieId && shouldLoadReviews,
  });

  const recommendationsQuery = useQuery({
    queryKey: ['movie', movieId, 'recommendations'],
    queryFn: () => tmdbApi.getRecommendedMovies(movieId),
    enabled: !!movieId && shouldLoadRecommendations,
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

  if (movieQuery.isLoading) {
    return (
      <View style={detailStyles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (movieQuery.isError || !movieQuery.data) {
    return (
      <View style={detailStyles.errorContainer}>
        <Text style={detailStyles.errorText}>Failed to load movie details</Text>
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

  const movie = movieQuery.data;
  const cast = creditsQuery.data?.cast.slice(0, 10) || [];
  const directors = creditsQuery.data?.crew.filter((c) => c.job === 'Director') || [];
  const videos = videosQuery.data || [];
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ||
    videos.find((v) => v.type === 'Trailer') ||
    videos[0];
  const similarMovies = similarQuery.data?.results.slice(0, 10) || [];
  const watchProviders = watchProvidersQuery.data;
  const watchProvidersLink = watchProvidersQuery.data?.link;
  const images = imagesQuery.data;
  const reviews = reviewsQuery.data?.results.slice(0, 10) || [];
  const recommendations = recommendationsQuery.data?.results.slice(0, 10) || [];

  const backdropUrl = getImageUrl(movie.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);
  const posterUrl = getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const handleTrailerPress = () => {
    if (trailer) {
      setSelectedVideo(trailer);
      setTrailerModalVisible(true);
    }
  };

  const handleCastPress = (personId: number) => {
    navigateTo(`/person/${personId}`);
  };

  const handleMoviePress = (id: number) => {
    navigateTo(`/movie/${id}`);
  };

  const handleCollectionPress = (collectionId: number) => {
    navigateTo(`/collection/${collectionId}`);
  };

  const handleCastViewAll = () => {
    navigateTo(`/movie/${movieId}/cast?title=${encodeURIComponent(movie.title)}`);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        movieQuery.refetch(),
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

  const handleSetReminder = async (timing: ReminderTiming) => {
    // Request permission first
    const hasPermission = await requestPermission();
    if (!hasPermission) {
      throw new Error('Notification permission required');
    }

    if (!movie?.release_date) {
      throw new Error('This movie does not have a release date');
    }

    if (hasReminder && reminder) {
      // Update existing reminder
      await updateReminderMutation.mutateAsync({
        reminderId: reminder.id,
        timing,
      });
    } else {
      // Create new reminder
      await createReminderMutation.mutateAsync({
        mediaId: movieId,
        mediaType: 'movie',
        title: movie.title,
        posterPath: movie.poster_path,
        releaseDate: movie.release_date,
        reminderTiming: timing,
      });
    }
  };

  const handleCancelReminder = async () => {
    if (!reminder) return;
    await cancelReminderMutation.mutateAsync(reminder.id);
  };

  return (
    <View style={detailStyles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <AnimatedScrollHeader
        title={movie.title}
        onBackPress={() => router.back()}
        scrollY={scrollY}
      />

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
            id={movieId}
            title={movie.title}
            mediaType="movie"
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
          <Text style={detailStyles.title}>{movie.title}</Text>

          <View style={detailStyles.metaContainer}>
            <View style={detailStyles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={detailStyles.metaText}>
                {movie.release_date
                  ? formatTmdbDate(movie.release_date, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Unknown'}
              </Text>
            </View>
            <View style={detailStyles.metaItem}>
              <Clock size={14} color={COLORS.textSecondary} />
              <Text style={detailStyles.metaText}>{formatRuntime(movie.runtime)}</Text>
            </View>
            <View style={detailStyles.metaItem}>
              <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
              <Text style={[detailStyles.metaText, { color: COLORS.warning }]}>
                {movie.vote_average.toFixed(1)}
              </Text>
            </View>
            {movie.original_language !== 'en' && (
              <View style={detailStyles.metaItem}>
                <Globe size={14} color={COLORS.textSecondary} />
                <Text style={detailStyles.metaText}>
                  {getLanguageName(movie.original_language)}
                </Text>
              </View>
            )}
          </View>

          <View style={detailStyles.genresContainer}>
            {movie.genres.map((genre) => (
              <View key={genre.id} style={detailStyles.genreTag}>
                <Text style={detailStyles.genreText}>{genre.name}</Text>
              </View>
            ))}
          </View>

          {/* Action Buttons */}
          <View style={detailStyles.actionButtons}>
            {/* Watch Trailer Button */}
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
                requireAuth(
                  () => addToListModalRef.current?.present(),
                  'Sign in to add items to your lists'
                )
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

            {/* Reminder Button */}
            {canShowReminder(movie.release_date) && (
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
            <View style={detailStyles.ratingButtonContainer}>
              <RatingButton
                onPress={() =>
                  requireAuth(() => setRatingModalVisible(true), 'Sign in to rate movies and shows')
                }
                isRated={userRating > 0}
                isLoading={isLoadingRating}
              />
            </View>
          </View>

          {userRating > 0 && <UserRating rating={userRating} />}

          <Text style={detailStyles.sectionTitle}>Overview</Text>
          <ExpandableText
            text={movie.overview || 'No overview available'}
            style={detailStyles.overview}
            readMoreStyle={detailStyles.readMore}
          />

          <SectionSeparator />

          {/* Directors Section */}
          <DirectorsSection
            directors={directors}
            onDirectorPress={(id) => navigateTo(`/person/${id}`)}
          />

          {directors.length > 0 && <SectionSeparator />}

          {/* Watch Providers */}
          <WatchProvidersSection watchProviders={watchProviders} link={watchProvidersLink} />

          {hasWatchProviders(watchProviders) && <SectionSeparator />}

          {/* Cast */}
          <CastSection cast={cast} onCastPress={handleCastPress} onViewAll={handleCastViewAll} />

          {cast.length > 0 && <SectionSeparator />}

          {/* Similar Movies */}
          <SimilarMediaSection
            mediaType="movie"
            items={similarMovies}
            onMediaPress={handleMoviePress}
            title="Similar Movies"
          />

          {similarMovies.length > 0 && <SectionSeparator />}

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
            mediaType="movie"
            items={recommendations}
            isLoading={recommendationsQuery.isLoading}
            isError={recommendationsQuery.isError}
            shouldLoad={shouldLoadRecommendations}
            onMediaPress={handleMoviePress}
            onLayout={() => {
              if (!shouldLoadRecommendations) {
                setShouldLoadRecommendations(true);
              }
            }}
          />

          {recommendations.length > 0 && <SectionSeparator />}

          {/* Collections */}
          {movie.belongs_to_collection && (
            <>
              <CollectionSection
                collection={movie.belongs_to_collection}
                shouldLoad={shouldLoadCollections}
                onCollectionPress={handleCollectionPress}
                onLayout={() => {
                  if (!shouldLoadCollections) {
                    setShouldLoadCollections(true);
                  }
                }}
              />
              <SectionSeparator />
            </>
          )}

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
          <MediaDetailsInfo media={movie} type="movie" />
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

      {movie && (
        <>
          <AddToListModal
            ref={addToListModalRef}
            mediaItem={{
              id: movie.id,
              title: movie.title,
              poster_path: movie.poster_path,
              media_type: 'movie',
              vote_average: movie.vote_average,
              release_date: movie.release_date,
              genre_ids: movie.genres?.map((g) => g.id) || [],
            }}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <RatingModal
            visible={ratingModalVisible}
            onClose={() => setRatingModalVisible(false)}
            mediaId={movie.id}
            mediaType="movie"
            initialRating={userRating}
            onRatingSuccess={() => {}}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <ReminderModal
            visible={reminderModalVisible}
            onClose={() => setReminderModalVisible(false)}
            movieId={movie.id}
            movieTitle={movie.title}
            releaseDate={movie.release_date || null}
            currentTiming={reminder?.reminderTiming}
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
