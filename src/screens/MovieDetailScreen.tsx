import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi, type Video } from '@/src/api/tmdb';
import AddToListModal, { AddToListModalRef } from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { CollectionSection } from '@/src/components/detail/CollectionSection';
import { DetailScreenSkeleton } from '@/src/components/detail/DetailScreenSkeleton';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { DirectorsSection } from '@/src/components/detail/DirectorsSection';
import { ExternalRatingsSection } from '@/src/components/detail/ExternalRatingsSection';
import { MarkAsWatchedButton } from '@/src/components/detail/MarkAsWatchedButton';
import { MediaActionButtons } from '@/src/components/detail/MediaActionButtons';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { TraktReviewsSection } from '@/src/components/detail/TraktReviewsSection';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import MarkAsWatchedModal from '@/src/components/MarkAsWatchedModal';
import NoteModal, { NoteModalRef } from '@/src/components/NotesModal';
import RatingModal from '@/src/components/RatingModal';
import ReminderModal from '@/src/components/ReminderModal';
import ShareCardModal from '@/src/components/ShareCardModal';
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
import { useRegion } from '@/src/context/RegionProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { errorStyles } from '@/src/styles/errorStyles';
import { useAnimatedScrollHeader } from '@/src/hooks/useAnimatedScrollHeader';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import { useContentFilter } from '@/src/hooks/useContentFilter';
import { useDetailLongPress } from '@/src/hooks/useDetailLongPress';
import { useExternalRatings } from '@/src/hooks/useExternalRatings';
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
import { useAddWatch, useClearWatches, useWatchedMovies } from '@/src/hooks/useWatchedMovies';
import { collectionTrackingService } from '@/src/services/CollectionTrackingService';
import { ReminderTiming } from '@/src/types/reminder';
import { formatTmdbDate, parseTmdbDate } from '@/src/utils/dateUtils';
import { getLanguageName } from '@/src/utils/languages';
import {
  getListColor,
  getListIconComponent,
  MULTIPLE_LISTS_COLOR,
  MultipleListsIcon,
} from '@/src/utils/listIcons';
import { getRegionalReleaseDate, hasWatchProviders } from '@/src/utils/mediaUtils';
import { useQuery } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Clock, Globe, Star } from 'lucide-react-native';
import React, { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Animated, RefreshControl, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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
  const { t } = useTranslation();
  const movieId = Number(id);
  const { region } = useRegion();
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
  const [shouldLoadCollections, setShouldLoadCollections] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [watchedModalVisible, setWatchedModalVisible] = useState(false);
  const [shareCardModalVisible, setShareCardModalVisible] = useState(false);
  const [isSavingWatch, setIsSavingWatch] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);
  const { scrollY, scrollViewProps } = useAnimatedScrollHeader();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  // Long-press handler for similar/recommended media
  const {
    handleLongPress: handleMediaLongPress,
    addToListModalRef: similarMediaModalRef,
    selectedMediaItem: selectedSimilarMediaItem,
  } = useDetailLongPress('movie');

  // External ratings (IMDb, RT, Metacritic)
  const { ratings: externalRatings, isLoading: isLoadingExternalRatings } = useExternalRatings(
    'movie',
    movieId
  );

  // Wrap the long-press handler with auth guard
  const guardedHandleMediaLongPress = useCallback(
    (item: any) => {
      requireAuth(() => handleMediaLongPress(item), t('movieDetail.signInToAddItems'));
    },
    [requireAuth, handleMediaLongPress, t]
  );

  const { membership, isLoading: isLoadingLists } = useMediaLists(movieId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(movieId, 'movie');
  const { preferences } = usePreferences();
  const listIds = Object.keys(membership);
  const isInAnyList = listIds.length > 0;
  const listIcon =
    listIds.length === 1
      ? getListIconComponent(listIds[0])
      : isInAnyList
        ? MultipleListsIcon
        : undefined;
  const listColor =
    listIds.length === 1
      ? getListColor(listIds[0])
      : isInAnyList
        ? MULTIPLE_LISTS_COLOR
        : undefined;

  const {
    reminder,
    hasReminder,
    isLoading: isLoadingReminder,
  } = useMediaReminder(movieId, 'movie');
  const { note, hasNote, isLoading: isLoadingNote } = useMediaNote('movie', movieId);
  const { requestPermission } = useNotificationPermissions();
  const createReminderMutation = useCreateReminder();
  const cancelReminderMutation = useCancelReminder();
  const updateReminderMutation = useUpdateReminder();

  // Watched movies feature
  const { count: watchCount, isLoading: isLoadingWatched } = useWatchedMovies(movieId);
  const addWatchMutation = useAddWatch(movieId);
  const clearWatchesMutation = useClearWatches(movieId);

  // Trakt reviews
  const {
    reviews: traktReviews,
    isLoading: isLoadingTraktReviews,
    isError: isTraktReviewsError,
  } = useTraktReviews(movieId, 'movie', shouldLoadTraktReviews);

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

  // Progressive rendering: defer heavy component tree by one tick on cache hit
  const { isReady } = useProgressiveRender();

  // Filter out watched content - must be called before early returns (Rules of Hooks)
  const rawSimilarMovies = similarQuery.data?.results.slice(0, 10) || [];
  const rawRecommendations = recommendationsQuery.data?.results.slice(0, 10) || [];
  const filteredSimilarMovies = useContentFilter(rawSimilarMovies);
  const filteredRecommendations = useContentFilter(rawRecommendations);

  if (!isReady || movieQuery.isLoading) {
    return <DetailScreenSkeleton />;
  }

  if (movieQuery.isError || !movieQuery.data) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.text}>{t('movieDetail.failedToLoad')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={detailStyles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={detailStyles.backButtonText}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const movie = movieQuery.data;
  // Get region-specific release date
  const displayReleaseDate = getRegionalReleaseDate(movie, region);

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
    if (!minutes) return t('common.notAvailable');
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
      throw new Error(t('reminder.permissionRequired'));
    }

    if (!displayReleaseDate) {
      throw new Error(t('reminder.noReleaseDate'));
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
        releaseDate: displayReleaseDate,
        reminderTiming: timing,
      });
    }
  };

  const handleCancelReminder = async () => {
    if (!reminder) return;
    await cancelReminderMutation.mutateAsync(reminder.id);
  };

  // Handle marking the movie as watched with a specific date
  const handleMarkAsWatched = async (date: Date) => {
    const isFirstWatch = watchCount === 0;
    await addWatchMutation.mutateAsync(date);

    // Update collection tracking if movie belongs to a tracked collection
    if (movie?.belongs_to_collection) {
      try {
        await collectionTrackingService.addWatchedMovie(movie.belongs_to_collection.id, movieId);
      } catch (collectionError) {
        // Silent fail - collection might not be tracked
        console.log('[MovieDetailScreen] Collection tracking update skipped:', collectionError);
      }
    }

    // Auto-add to "Already Watched" list on first watch
    if (isFirstWatch && preferences?.autoAddToAlreadyWatched && movie) {
      const isNotInAlreadyWatched = !membership['already-watched'];

      if (isNotInAlreadyWatched) {
        try {
          const { listService } = await import('../services/ListService');
          await listService.addToList(
            'already-watched',
            {
              id: movieId,
              title: movie.title,
              poster_path: movie.poster_path,
              media_type: 'movie',
              vote_average: movie.vote_average,
              release_date: displayReleaseDate || movie.release_date,
              genre_ids: movie.genres?.map((g) => g.id),
            },
            t('lists.alreadyWatched')
          );
          console.log('[MovieDetailScreen] Auto-added to Already Watched list:', movie.title);
        } catch (autoAddError) {
          console.error('[MovieDetailScreen] Auto-add to Already Watched failed:', autoAddError);
        }
      }
    }
  };

  // Handle clearing all watch history
  const handleClearWatches = async () => {
    await clearWatchesMutation.mutateAsync();
  };

  // Handle button press - either show modal or quick mark based on preference
  const handleWatchedButtonPress = () => {
    requireAuth(async () => {
      if (preferences?.quickMarkAsWatched) {
        // Quick mark: save immediately with current time
        setIsSavingWatch(true);
        try {
          const isFirstWatch = watchCount === 0;
          await addWatchMutation.mutateAsync(new Date());

          // Update collection tracking if movie belongs to a tracked collection
          if (movie?.belongs_to_collection) {
            try {
              await collectionTrackingService.addWatchedMovie(
                movie.belongs_to_collection.id,
                movieId
              );
            } catch (collectionError) {
              // Silent fail - collection might not be tracked
              console.log(
                '[MovieDetailScreen] Collection tracking update skipped:',
                collectionError
              );
            }
          }

          // Auto-add to "Already Watched" list on first watch
          if (isFirstWatch && preferences?.autoAddToAlreadyWatched && movie) {
            const isNotInAlreadyWatched = !membership['already-watched'];

            if (isNotInAlreadyWatched) {
              try {
                const { listService } = await import('../services/ListService');
                await listService.addToList(
                  'already-watched',
                  {
                    id: movieId,
                    title: movie.title,
                    poster_path: movie.poster_path,
                    media_type: 'movie',
                    vote_average: movie.vote_average,
                    release_date: displayReleaseDate || movie.release_date,
                    genre_ids: movie.genres?.map((g) => g.id),
                  },
                  t('lists.alreadyWatched')
                );
                console.log('[MovieDetailScreen] Auto-added to Already Watched list:', movie.title);
              } catch (autoAddError) {
                console.error(
                  '[MovieDetailScreen] Auto-add to Already Watched failed:',
                  autoAddError
                );
              }
            }
          }

          toastRef.current?.show(t('library.markedAsWatched'));
        } catch (error) {
          toastRef.current?.show(error instanceof Error ? error.message : t('errors.saveFailed'));
        } finally {
          setIsSavingWatch(false);
        }
      } else {
        // Show modal for date selection
        setWatchedModalVisible(true);
      }
    }, t('authGuards.trackWatchedMovies'));
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
          <TouchableOpacity
            activeOpacity={1}
            onLongPress={async () => {
              await Clipboard.setStringAsync(movie.title);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              toastRef.current?.show(t('common.copiedToClipboard'));
            }}
          >
            <Text style={detailStyles.title}>{movie.title}</Text>
          </TouchableOpacity>

          <View style={detailStyles.metaContainer}>
            <View style={detailStyles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={detailStyles.metaText}>
                {displayReleaseDate
                  ? formatTmdbDate(displayReleaseDate, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : t('common.unknown')}
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

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -SPACING.l }}
            contentContainerStyle={{ paddingHorizontal: SPACING.l }}
          >
            <View style={detailStyles.genresContainer}>
              {movie.genres.map((genre) => (
                <View key={genre.id} style={detailStyles.genreTag}>
                  <Text style={detailStyles.genreText}>{genre.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <MediaActionButtons
            onAddToList={() =>
              requireAuth(
                () => addToListModalRef.current?.present(),
                t('discover.signInToAdd')
              )
            }
            onRate={() =>
              requireAuth(() => setRatingModalVisible(true), t('authGuards.rateMoviesAndShows'))
            }
            onReminder={
              canShowReminder(displayReleaseDate)
                ? () =>
                    requireAuth(
                      () => setReminderModalVisible(true),
                      t('authGuards.setReleaseReminders')
                    )
                : undefined
            }
            onNote={() =>
              requireAuth(
                () =>
                  noteSheetRef.current?.present({
                    mediaType: 'movie',
                    mediaId: movieId,
                    posterPath: movie.poster_path,
                    mediaTitle: movie.title,
                    initialNote: note?.content,
                  }),
                t('authGuards.addNotes')
              )
            }
            onTrailer={handleTrailerPress}
            onShareCard={() => setShareCardModalVisible(true)}
            isInAnyList={isInAnyList}
            isLoadingLists={isLoadingLists}
            listIcon={listIcon}
            listColor={listColor}
            userRating={userRating}
            isLoadingRating={isLoadingRating}
            hasReminder={hasReminder}
            isLoadingReminder={isLoadingReminder}
            hasNote={hasNote}
            isLoadingNote={isLoadingNote}
            hasTrailer={!!trailer}
          />

          {/* Mark as Watched Button - Movie only */}
          <MarkAsWatchedButton
            watchCount={watchCount}
            isLoading={isLoadingWatched || isSavingWatch}
            onPress={handleWatchedButtonPress}
            disabled={isSavingWatch}
          />

          {userRating > 0 && <UserRating rating={userRating} />}

          {/* External Ratings (IMDb, Rotten Tomatoes, Metacritic) */}
          <ExternalRatingsSection ratings={externalRatings} isLoading={isLoadingExternalRatings} />

          <Text style={[detailStyles.sectionTitle]}>{t('media.overview')}</Text>
          {preferences?.blurPlotSpoilers ? (
            <BlurredText
              text={movie.overview || t('media.noOverview')}
              style={detailStyles.overview}
              readMoreStyle={detailStyles.readMore}
              isBlurred={true}
            />
          ) : (
            <ExpandableText
              text={movie.overview || t('media.noOverview')}
              style={detailStyles.overview}
              readMoreStyle={detailStyles.readMore}
            />
          )}

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
            items={filteredSimilarMovies}
            onMediaPress={handleMoviePress}
            onMediaLongPress={guardedHandleMediaLongPress}
            title={t('media.similarMovies')}
          />

          {filteredSimilarMovies.length > 0 && <SectionSeparator />}

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
            items={filteredRecommendations}
            isLoading={recommendationsQuery.isLoading}
            isError={recommendationsQuery.isError}
            shouldLoad={shouldLoadRecommendations}
            onMediaPress={handleMoviePress}
            onMediaLongPress={guardedHandleMediaLongPress}
            onLayout={() => {
              if (!shouldLoadRecommendations) {
                setShouldLoadRecommendations(true);
              }
            }}
          />

          {filteredRecommendations.length > 0 && <SectionSeparator />}

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
              release_date: displayReleaseDate || movie.release_date,
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
            autoAddOptions={{
              shouldAutoAdd: preferences?.autoAddToAlreadyWatched,
              listMembership: membership,
              mediaMetadata: {
                title: movie.title,
                poster_path: movie.poster_path,
                vote_average: movie.vote_average,
                release_date: displayReleaseDate || movie.release_date || '',
                genre_ids: movie.genres?.map((g) => g.id),
              },
            }}
          />
          <ReminderModal
            visible={reminderModalVisible}
            onClose={() => setReminderModalVisible(false)}
            movieTitle={movie.title}
            releaseDate={displayReleaseDate || movie.release_date || null}
            currentTiming={reminder?.reminderTiming}
            hasReminder={hasReminder}
            onSetReminder={handleSetReminder}
            onCancelReminder={handleCancelReminder}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          <NoteModal ref={noteSheetRef} />
          <MarkAsWatchedModal
            visible={watchedModalVisible}
            onClose={() => setWatchedModalVisible(false)}
            movieTitle={movie.title}
            releaseDate={displayReleaseDate || movie.release_date || null}
            watchCount={watchCount}
            onMarkAsWatched={handleMarkAsWatched}
            onClearAll={handleClearWatches}
            onShowToast={(message) => toastRef.current?.show(message)}
          />
          {/* Lazy load ShareCardModal - only mount when needed */}
          {shareCardModalVisible && (
            <ShareCardModal
              visible={shareCardModalVisible}
              onClose={() => setShareCardModalVisible(false)}
              mediaData={{
                id: movie.id,
                type: 'movie',
                title: movie.title,
                posterPath: movie.poster_path,
                backdropPath: movie.backdrop_path,
                releaseYear: (displayReleaseDate || movie.release_date)?.split('-')[0] || '',
                genres: movie.genres?.map((g) => g.name) || [],
                userRating,
              }}
              onShowToast={(message) => toastRef.current?.show(message)}
            />
          )}
        </>
      )}
      <Toast ref={toastRef} />
      {AuthGuardModal}

      {/* AddToListModal for long-pressed similar/recommended media */}
      {selectedSimilarMediaItem && (
        <AddToListModal
          ref={similarMediaModalRef}
          mediaItem={selectedSimilarMediaItem}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
      )}
    </View>
  );
}
