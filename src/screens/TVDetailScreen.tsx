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
import { MediaImage } from '@/src/components/ui/MediaImage';
import { SectionSeparator } from '@/src/components/ui/SectionSeparator';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import TrailerPlayer from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useMediaLists } from '@/src/hooks/useLists';
import { getLanguageName } from '@/src/utils/languages';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
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

export default function TVDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const tvId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [listModalVisible, setListModalVisible] = useState(false);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [shouldLoadReviews, setShouldLoadReviews] = useState(false);
  const [shouldLoadRecommendations, setShouldLoadRecommendations] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);

  const { membership, isLoading: isLoadingLists } = useMediaLists(tvId);
  const isInAnyList = Object.keys(membership).length > 0;

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

  if (tvQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (tvQuery.isError || !tvQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load TV show details</Text>
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

  const handleShowPress = (id: number) => {
    navigateTo(`/tv/${id}`);
  };

  const handleSeasonsPress = () => {
    navigateTo(`/tv/${tvId}/seasons`);
  };

  const handleCastViewAll = () => {
    navigateTo(`/tv/${tvId}/cast`);
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

          <View style={styles.posterContainer}>
            <MediaImage source={{ uri: posterUrl }} style={styles.poster} contentFit="cover" />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{show.name}</Text>

          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>
                {show.first_air_date
                  ? new Date(show.first_air_date).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })
                  : 'Unknown'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.metaItem}
              onPress={handleSeasonsPress}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Layers size={14} color={COLORS.primary} />
              <Text style={[styles.metaText, { color: COLORS.primary }]}>
                {show.number_of_seasons} Seasons
              </Text>
            </TouchableOpacity>
            <View style={styles.metaItem}>
              <Tv size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>{show.number_of_episodes} Episodes</Text>
            </View>
            <View style={styles.metaItem}>
              <Star size={14} color={COLORS.warning} fill={COLORS.warning} />
              <Text style={[styles.metaText, { color: COLORS.warning }]}>
                {show.vote_average.toFixed(1)}
              </Text>
            </View>
            {show.original_language !== 'en' && (
              <View style={styles.metaItem}>
                <Globe size={14} color={COLORS.textSecondary} />
                <Text style={styles.metaText}>{getLanguageName(show.original_language)}</Text>
              </View>
            )}
            {(show.status === 'Ended' || show.status === 'Canceled') && (
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>{show.status}</Text>
              </View>
            )}
          </View>

          <View style={styles.genresContainer}>
            {show.genres.map((genre) => (
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
          </View>

          <Text style={detailStyles.sectionTitle}>Overview</Text>
          <Text style={detailStyles.overview} numberOfLines={overviewExpanded ? undefined : 4}>
            {show.overview || 'No overview available'}
          </Text>
          {show.overview && show.overview.length > 200 && (
            <TouchableOpacity
              onPress={() => setOverviewExpanded(!overviewExpanded)}
              activeOpacity={ACTIVE_OPACITY}
            >
              <Text style={detailStyles.readMore}>{overviewExpanded ? 'Read less' : 'Read more'}</Text>
            </TouchableOpacity>
          )}

          <SectionSeparator />

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
          <WatchProvidersSection watchProviders={watchProviders} />

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

      {show && (
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
          }}
          onShowToast={(message) => toastRef.current?.show(message)}
        />
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
    marginLeft: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.round,
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
  statusBadge: {
    backgroundColor: COLORS.error,
    paddingHorizontal: SPACING.s,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.s,
  },
  statusBadgeText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
    textTransform: 'uppercase',
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
});
