import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import AddToListModal from '@/src/components/AddToListModal';
import { CastSection } from '@/src/components/detail/CastSection';
import { detailStyles } from '@/src/components/detail/detailStyles';
import { MediaDetailsInfo } from '@/src/components/detail/MediaDetailsInfo';
import { PhotosSection } from '@/src/components/detail/PhotosSection';
import { RecommendationsSection } from '@/src/components/detail/RecommendationsSection';
import { ReviewsSection } from '@/src/components/detail/ReviewsSection';
import { SimilarMediaSection } from '@/src/components/detail/SimilarMediaSection';
import { type Video } from '@/src/components/detail/types';
import { VideosSection } from '@/src/components/detail/VideosSection';
import { WatchProvidersSection } from '@/src/components/detail/WatchProvidersSection';
import ImageLightbox from '@/src/components/ImageLightbox';
import RatingButton from '@/src/components/RatingButton';
import RatingModal from '@/src/components/RatingModal';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import { ShareButton } from '@/src/components/ui/ShareButton';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import UserRating from '@/src/components/UserRating';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useMediaLists } from '@/src/hooks/useLists';
import { useMediaRating } from '@/src/hooks/useRatings';
import { getLanguageName } from '@/src/utils/languages';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Calendar, Check, Clock, Globe, Play, Plus, Star } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
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

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const movieId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [listModalVisible, setListModalVisible] = useState(false);
  const [ratingModalVisible, setRatingModalVisible] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);

  const { membership, isLoading: isLoadingLists } = useMediaLists(movieId);
  const { userRating, isLoading: isLoadingRating } = useMediaRating(movieId, 'movie');
  const isInAnyList = Object.keys(membership).length > 0;

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

  if (movieQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (movieQuery.isError || !movieQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load movie details</Text>
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

  const movie = movieQuery.data;
  const cast = creditsQuery.data?.cast.slice(0, 10) || [];
  const director = creditsQuery.data?.crew.find((c) => c.job === 'Director');
  const videos = videosQuery.data || [];
  const trailer =
    videos.find((v) => v.type === 'Trailer' && v.official) ||
    videos.find((v) => v.type === 'Trailer') ||
    videos[0];
  const similarMovies = similarQuery.data?.results.slice(0, 10) || [];
  const watchProviders = watchProvidersQuery.data;
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

  const navigateTo = (path: string) => {
    const currentTab = segments[1];
    if (currentTab) {
      router.push(`/(tabs)/${currentTab}${path}` as any);
    } else {
      router.push(path as any);
    }
  };

  const handleCastPress = (personId: number) => {
    navigateTo(`/person/${personId}`);
  };

  const handleMoviePress = (id: number) => {
    navigateTo(`/movie/${id}`);
  };

  const handleCastViewAll = () => {
    navigateTo(`/movie/${movieId}/cast`);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.scrollView} bounces={false}>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <MediaImage source={{ uri: backdropUrl }} style={styles.backdrop} contentFit="cover" />
          <LinearGradient colors={['transparent', COLORS.background]} style={styles.gradient} />

          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <TouchableOpacity
              style={styles.headerButton}
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

          <View style={styles.posterContainer}>
            <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{movie.title}</Text>

          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>
                {movie.release_date
                  ? new Date(movie.release_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Unknown'}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Clock size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{formatRuntime(movie.runtime)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
              <Text style={[styles.metaText, { color: COLORS.warning }]}>
                {movie.vote_average.toFixed(1)}
              </Text>
            </View>
            {movie.original_language !== 'en' && (
              <View style={styles.metaItem}>
                <Globe size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{getLanguageName(movie.original_language)}</Text>
              </View>
            )}
          </View>

          <View style={styles.genresContainer}>
            {movie.genres.map((genre) => (
              <View key={genre.id} style={styles.genreTag}>
                <Text style={styles.genreText}>{genre.name}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.playButton, !trailer && styles.disabledButton]}
              onPress={handleTrailerPress}
              disabled={!trailer}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Play size={20} color={COLORS.white} fill={COLORS.white} />
              <Text style={styles.playButtonText}>Watch Trailer</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.addButton, isInAnyList && styles.addedButton]}
              activeOpacity={ACTIVE_OPACITY}
              onPress={() => setListModalVisible(true)}
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
            <View style={styles.ratingButtonContainer}>
              <RatingButton
                onPress={() => setRatingModalVisible(true)}
                isRated={userRating > 0}
                isLoading={isLoadingRating}
              />
            </View>
          </View>

          {userRating > 0 && <UserRating rating={userRating} />}

          <Text style={detailStyles.sectionTitle}>Overview</Text>
          <Text style={detailStyles.overview} numberOfLines={overviewExpanded ? undefined : 4}>
            {movie.overview || 'No overview available'}
          </Text>
          {movie.overview && movie.overview.length > 200 && (
            <TouchableOpacity
              onPress={() => setOverviewExpanded(!overviewExpanded)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={detailStyles.readMore}>
                {overviewExpanded ? 'Read less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          )}

          <SectionSeparator />

          {director && (
            <View style={detailStyles.directorContainer}>
              <Text style={detailStyles.label}>Director: </Text>
              <TouchableOpacity
                onPress={() => navigateTo(`/person/${director.id}`)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[detailStyles.value, { color: COLORS.primary }]}>{director.name}</Text>
              </TouchableOpacity>
            </View>
          )}

          {director && <SectionSeparator />}

          {/* Watch Providers */}
          <WatchProvidersSection watchProviders={watchProviders} />

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
      </ScrollView>

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
            visible={listModalVisible}
            onClose={() => setListModalVisible(false)}
            mediaItem={{
              id: movie.id,
              title: movie.title,
              poster_path: movie.poster_path,
              media_type: 'movie',
              vote_average: movie.vote_average,
              release_date: movie.release_date,
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
        </>
      )}
      <Toast ref={toastRef} />
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
  },
  errorText: {
    color: COLORS.error,
    marginBottom: SPACING.m,
  },
  backButton: {
    padding: SPACING.m,
    paddingTop: SPACING.xl,
  },
  backButtonText: {
    color: COLORS.primary,
  },
  scrollView: {
    flex: 1,
  },
  heroContainer: {
    height: 400,
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
    top: 10,
    left: 0,
    zIndex: 10,
  },
  headerButton: {
    padding: SPACING.m,
    marginLeft: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.round,
  },
  posterContainer: {
    position: 'absolute',
    bottom: SPACING.l,
    left: SPACING.l,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  poster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
  },
  content: {
    paddingHorizontal: SPACING.l,
    marginTop: -SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.s,
    marginTop: SPACING.s,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.m,
    flexWrap: 'wrap',
    gap: SPACING.m,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  genresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.s,
    marginBottom: SPACING.l,
  },
  genreTag: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.m,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.round,
  },
  genreText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.m,
    marginBottom: SPACING.xl,
  },
  playButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    gap: SPACING.s,
  },
  disabledButton: {
    opacity: 0.5,
  },
  playButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: FONT_SIZE.m,
  },
  addButton: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  addedButton: {
    backgroundColor: COLORS.success,
  },
  ratingButtonContainer: {
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
});
