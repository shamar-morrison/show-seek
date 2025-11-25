import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  Image, 
  TouchableOpacity, 
  ActivityIndicator,
  Dimensions
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Star, Calendar, Plus, Play, Layers, Tv } from 'lucide-react-native';
import { COLORS, SPACING, FONT_SIZE, BORDER_RADIUS } from '@/src/constants/theme';
import { tmdbApi, getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import VideoPlayerModal from '@/src/components/VideoPlayerModal';

const { width } = Dimensions.get('window');

export default function TVShowDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const tvId = Number(id);
  const [trailerModalVisible, setTrailerModalVisible] = useState(false);

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
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const show = tvQuery.data;
  const cast = creditsQuery.data?.cast.slice(0, 10) || [];
  const creator = creditsQuery.data?.crew.find(c => c.job === 'Executive Producer' || c.job === 'Creator');
  const videos = videosQuery.data || [];
  const trailer = videos.find(v => v.type === 'Trailer' && v.official) || 
                  videos.find(v => v.type === 'Trailer') ||
                  videos[0];
  const similarShows = similarQuery.data?.results.slice(0, 10) || [];
  const watchProviders = watchProvidersQuery.data;
  const images = imagesQuery.data;

  const backdropUrl = getImageUrl(show.backdrop_path, TMDB_IMAGE_SIZES.backdrop.medium);
  const posterUrl = getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.medium);

  const handleTrailerPress = () => {
    if (trailer) {
      setTrailerModalVisible(true);
    }
  };

  const handleCastPress = (personId: number) => {
    router.push(`/person/${personId}` as any);
  };

  const handleShowPress = (id: number) => {
    router.push(`/tv/${id}` as any);
  };

  const handleSeasonsPress = () => {
    router.push(`/tv/${tvId}/seasons` as any);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      
      <ScrollView style={styles.scrollView} bounces={false}>
        {/* Hero Section */}
        <View style={styles.heroContainer}>
          <Image 
            source={{ uri: backdropUrl || 'https://via.placeholder.com/500x281' }} 
            style={styles.backdrop}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['transparent', COLORS.background]}
            style={styles.gradient}
          />
          
          <SafeAreaView style={styles.headerSafe} edges={['top']}>
            <TouchableOpacity 
              style={styles.headerButton} 
              onPress={() => router.back()}
            >
              <ArrowLeft size={24} color={COLORS.white} />
            </TouchableOpacity>
          </SafeAreaView>

          <View style={styles.posterContainer}>
            <Image 
              source={{ uri: posterUrl || 'https://via.placeholder.com/154x231' }} 
              style={styles.poster}
              resizeMode="cover"
            />
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <Text style={styles.title}>{show.name}</Text>
          
          <View style={styles.metaContainer}>
            <View style={styles.metaItem}>
              <Calendar size={14} color={COLORS.textSecondary} />
              <Text style={styles.metaText}>
                {new Date(show.first_air_date).getFullYear()}
              </Text>
            </View>
            <TouchableOpacity 
              style={styles.metaItem}
              onPress={handleSeasonsPress}
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
          </View>

          <View style={styles.genresContainer}>
            {show.genres.map(genre => (
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
             >
                <Play size={20} color={COLORS.white} fill={COLORS.white} />
                <Text style={styles.playButtonText}>Watch Trailer</Text>
             </TouchableOpacity>
             <TouchableOpacity style={styles.addButton}>
                <Plus size={24} color={COLORS.white} />
             </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Overview</Text>
          <Text style={styles.overview}>{show.overview}</Text>

          {creator && (
            <View style={styles.directorContainer}>
              <Text style={styles.label}>Creator: </Text>
              <Text style={styles.value}>{creator.name}</Text>
            </View>
          )}

          {/* Watch Providers */}
          {watchProviders && (watchProviders.flatrate || watchProviders.rent || watchProviders.buy) && (
            <>
              <Text style={styles.sectionTitle}>Where to Watch</Text>
              {watchProviders.flatrate && watchProviders.flatrate.length > 0 && (
                <View style={styles.providersSection}>
                  <Text style={styles.providerType}>Streaming</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {watchProviders.flatrate.map(provider => (
                      <View key={provider.provider_id} style={styles.providerCard}>
                        <Image
                          source={{ uri: getImageUrl(provider.logo_path, '/w92') || '' }}
                          style={styles.providerLogo}
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
              <Text style={styles.sectionTitle}>Cast</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.castList}>
                {cast.map(actor => (
                  <TouchableOpacity 
                    key={actor.id} 
                    style={styles.castCard}
                    onPress={() => handleCastPress(actor.id)}
                  >
                    <Image 
                      source={{ 
                        uri: getImageUrl(actor.profile_path, TMDB_IMAGE_SIZES.profile.medium) || 'https://via.placeholder.com/100' 
                      }} 
                      style={styles.castImage}
                    />
                    <Text style={styles.castName} numberOfLines={2}>{actor.name}</Text>
                    <Text style={styles.characterName} numberOfLines={1}>{actor.character}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Similar Shows */}
          {similarShows.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Similar Shows</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.similarList}>
                {similarShows.map(similar => (
                  <TouchableOpacity 
                    key={similar.id} 
                    style={styles.similarCard}
                    onPress={() => handleShowPress(similar.id)}
                  >
                    <Image 
                      source={{ 
                        uri: getImageUrl(similar.poster_path, TMDB_IMAGE_SIZES.poster.small) || 'https://via.placeholder.com/185x278' 
                      }} 
                      style={styles.similarPoster}
                    />
                    <Text style={styles.similarTitle} numberOfLines={2}>{similar.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Photos */}
          {images && images.backdrops && images.backdrops.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosList}>
                {images.backdrops.slice(0, 10).map((image, index) => (
                  <Image 
                    key={index}
                    source={{ uri: getImageUrl(image.file_path, TMDB_IMAGE_SIZES.backdrop.small) || '' }} 
                    style={styles.photoImage}
                  />
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
    top: 0,
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
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
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
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.s,
    marginTop: SPACING.m,
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
