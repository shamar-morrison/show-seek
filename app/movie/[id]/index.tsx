import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import AddToListModal from '@/src/components/AddToListModal';
import ImageLightbox from '@/src/components/ImageLightbox';
import { MediaImage } from '@/src/components/ui/MediaImage';
import Toast, { ToastRef } from '@/src/components/ui/Toast';
import VideoPlayerModal from '@/src/components/VideoPlayerModal';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useMediaLists } from '@/src/hooks/useLists';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  DollarSign,
  Play,
  Plus,
  Star,
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

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const movieId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [listModalVisible, setListModalVisible] = useState(false);
  const toastRef = React.useRef<ToastRef>(null);

  const { membership, isLoading: isLoadingLists } = useMediaLists(movieId);
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

  const backdropUrl = getImageUrl(movie.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);
  const posterUrl = getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const formatRuntime = (minutes: number | null) => {
    if (!minutes) return 'N/A';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m}m`;
  };

  const formatMoney = (amount: number) => {
    if (!amount) return 'N/A';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const handleTrailerPress = () => {
    if (trailer) {
      setTrailerModalVisible(true);
    }
  };

  const handleCastPress = (personId: number) => {
    router.push(`/person/${personId}` as any);
  };

  const handleMoviePress = (id: number) => {
    router.push(`/movie/${id}` as any);
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
          <Text style={styles.title}>{movie.title}</Text>

          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(movie.release_date).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
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
          </View>

          {/* Budget & Revenue */}
          {(movie.budget > 0 || movie.revenue > 0) && (
            <View style={styles.financialContainer}>
              {movie.budget > 0 && (
                <View style={styles.financialItem}>
                  <DollarSign size={16} color={COLORS.textSecondary} />
                  <View>
                    <Text style={styles.financialLabel}>Budget</Text>
                    <Text style={styles.financialValue}>{formatMoney(movie.budget)}</Text>
                  </View>
                </View>
              )}
              {movie.revenue > 0 && (
                <View style={styles.financialItem}>
                  <DollarSign size={16} color={COLORS.success} />
                  <View>
                    <Text style={styles.financialLabel}>Revenue</Text>
                    <Text style={[styles.financialValue, { color: COLORS.success }]}>
                      {formatMoney(movie.revenue)}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.overview}>{movie.overview || 'No overview available'}</Text>

          {director && (
            <View style={styles.directorContainer}>
              <Text style={styles.label}>Director: </Text>
              <TouchableOpacity
                onPress={() => router.push(`/person/${director.id}` as any)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={[styles.value, { color: COLORS.primary }]}>{director.name}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Watch Providers */}
          {watchProviders &&
            (watchProviders.flatrate || watchProviders.rent || watchProviders.buy) && (
              <>
                <Text style={styles.sectionTitle}>Where to Watch</Text>
                {watchProviders.flatrate && watchProviders.flatrate.length > 0 && (
                  <View style={styles.providersSection}>
                    <Text style={styles.providerType}>Streaming</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      {watchProviders.flatrate.map((provider) => (
                        <View key={provider.provider_id} style={styles.providerCard}>
                          <MediaImage
                            source={{ uri: getImageUrl(provider.logo_path, '/w92') }}
                            style={styles.providerLogo}
                            contentFit="contain"
                          />
                          <Text style={styles.providerName} numberOfLines={1}>
                            {provider.provider_name}
                          </Text>
                        </View>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </>
            )}

          {cast.length > 0 && (
            <>
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => router.push(`/movie/${movieId}/cast` as any)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.sectionTitle}>Cast</Text>
                <ChevronRight size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castList}>
                {cast.map((actor) => (
                  <TouchableOpacity
                    key={actor.id}
                    style={styles.castCard}
                    onPress={() => handleCastPress(actor.id)}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <MediaImage
                      source={{
                        uri: getImageUrl(actor.profile_path, TMDB_IMAGE_SIZES.profile.medium),
                      }}
                      style={styles.castImage}
                      contentFit="cover"
                      placeholderType="person"
                    />
                    <Text style={styles.castName} numberOfLines={2}>
                      {actor.name}
                    </Text>
                    <Text style={styles.characterName} numberOfLines={1}>
                      {actor.character}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Similar Movies */}
          {similarMovies.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>
                Similar Movies
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.similarList}
              >
                {similarMovies.map((similar) => (
                  <TouchableOpacity
                    key={similar.id}
                    style={styles.similarCard}
                    onPress={() => handleMoviePress(similar.id)}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <MediaImage
                      source={{
                        uri: getImageUrl(similar.poster_path, TMDB_IMAGE_SIZES.poster.small),
                      }}
                      style={styles.similarPoster}
                      contentFit="cover"
                    />
                    <Text style={styles.similarTitle} numberOfLines={2}>
                      {similar.title}
                    </Text>
                    <View style={styles.similarMeta}>
                      {similar.release_date && (
                        <Text style={styles.similarYear}>
                          {new Date(similar.release_date).getFullYear()}
                        </Text>
                      )}
                      {similar.vote_average > 0 && similar.release_date && (
                        <Text style={styles.similarSeparator}> • </Text>
                      )}
                      {similar.vote_average > 0 && (
                        <View style={styles.similarRating}>
                          <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                          <Text style={styles.similarRatingText}>
                            {similar.vote_average.toFixed(1)}
                          </Text>
                        </View>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Photos */}
          {images && images.backdrops && images.backdrops.length > 0 && (
            <>
              <Text style={[styles.sectionTitle, { paddingBottom: SPACING.s }]}>Photos</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.photosList}
              >
                {images.backdrops.slice(0, 10).map((image, index) => (
                  <TouchableOpacity
                    key={`photo-${index}`}
                    onPress={() => {
                      setLightboxIndex(index);
                      setLightboxVisible(true);
                    }}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <MediaImage
                      source={{
                        uri: getImageUrl(image.file_path, TMDB_IMAGE_SIZES.backdrop.small),
                      }}
                      style={styles.photoImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          <View style={{ height: 100 }} />
        </View>
      </ScrollView>

      <VideoPlayerModal
        visible={trailerModalVisible}
        onClose={() => setTrailerModalVisible(false)}
        videoKey={trailer?.key || null}
        videoTitle={trailer?.name}
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
  financialContainer: {
    flexDirection: 'row',
    gap: SPACING.xl,
    marginBottom: SPACING.l,
    paddingVertical: SPACING.m,
    paddingHorizontal: SPACING.m,
    backgroundColor: COLORS.surfaceLight,
    borderRadius: BORDER_RADIUS.m,
  },
  financialItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  financialLabel: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginBottom: 2,
  },
  financialValue: {
    color: COLORS.white,
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    paddingBottom: SPACING.xs,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.s,
    marginTop: SPACING.m,
    paddingRight: SPACING.l,
  },
  overview: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
    marginBottom: SPACING.l,
  },
  directorContainer: {
    flexDirection: 'row',
    marginBottom: SPACING.l,
  },
  label: {
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  value: {
    color: COLORS.text,
  },
  providersSection: {
    marginBottom: SPACING.l,
  },
  providerType: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    marginBottom: SPACING.s,
    fontWeight: '600',
  },
  providerCard: {
    alignItems: 'center',
    marginRight: SPACING.m,
    width: 60,
  },
  providerLogo: {
    width: 50,
    height: 50,
    borderRadius: BORDER_RADIUS.s,
    marginBottom: SPACING.xs,
  },
  providerName: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
  castList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  castCard: {
    width: 100,
    marginRight: SPACING.m,
  },
  castImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: SPACING.s,
  },
  castName: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    textAlign: 'center',
  },
  characterName: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    textAlign: 'center',
  },
  similarList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  similarCard: {
    width: 120,
    marginRight: SPACING.m,
  },
  similarPoster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  similarTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  similarMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  similarYear: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  similarSeparator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  similarRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  similarRatingText: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
  photosList: {
    marginHorizontal: -SPACING.l,
    paddingHorizontal: SPACING.l,
  },
  photoImage: {
    width: 240,
    height: 135,
    borderRadius: BORDER_RADIUS.m,
    marginRight: SPACING.m,
  },
});
