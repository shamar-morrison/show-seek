import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter, useSegments } from 'expo-router';
import { ArrowLeft, Calendar, MapPin, Star } from 'lucide-react-native';
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

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const segments = useSegments();
  const personId = Number(id);
  const [bioExpanded, setBioExpanded] = useState(false);

  const personQuery = useQuery({
    queryKey: ['person', personId],
    queryFn: () => tmdbApi.getPersonDetails(personId),
    enabled: !!personId,
  });

  const movieCreditsQuery = useQuery({
    queryKey: ['person', personId, 'movie-credits'],
    queryFn: () => tmdbApi.getPersonMovieCredits(personId),
    enabled: !!personId,
  });

  const tvCreditsQuery = useQuery({
    queryKey: ['person', personId, 'tv-credits'],
    queryFn: () => tmdbApi.getPersonTVCredits(personId),
    enabled: !!personId,
  });

  if (personQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (personQuery.isError || !personQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load person details</Text>
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

  const person = personQuery.data;
  const movieCredits = movieCreditsQuery.data?.cast || [];
  const tvCredits = tvCreditsQuery.data?.cast || [];

  // Sort by popularity and get top items
  const knownForMovies = [...movieCredits].sort((a, b) => b.popularity - a.popularity).slice(0, 10);

  const knownForTV = [...tvCredits].sort((a, b) => b.popularity - a.popularity).slice(0, 10);

  const profileUrl = getImageUrl(person.profile_path, TMDB_IMAGE_SIZES.profile.large);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const calculateAge = (birthday: string | null, deathday: string | null) => {
    if (!birthday) return null;
    const birth = new Date(birthday);
    const end = deathday ? new Date(deathday) : new Date();
    const age = end.getFullYear() - birth.getFullYear();
    return age;
  };

  const navigateTo = (path: string) => {
    const currentTab = segments[1];
    if (currentTab) {
      router.push(`/(tabs)/${currentTab}${path}` as any);
    } else {
      router.push(path as any);
    }
  };

  const handleMoviePress = (id: number) => {
    navigateTo(`/movie/${id}`);
  };

  const handleTVPress = (id: number) => {
    navigateTo(`/tv/${id}`);
  };

  const age = calculateAge(person.birthday, person.deathday);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <ScrollView style={styles.scrollView} bounces={false}>
        <SafeAreaView edges={['top']}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => router.back()}
            activeOpacity={ACTIVE_OPACITY}
          >
            <ArrowLeft size={24} color={COLORS.white} />
          </TouchableOpacity>
        </SafeAreaView>

        {/* Profile Section */}
        <View style={styles.profileSection}>
          <MediaImage
            source={{ uri: profileUrl }}
            style={styles.profileImage}
            contentFit="cover"
            placeholderType="person"
          />

          <View style={styles.profileInfo}>
            <Text style={styles.name}>{person.name}</Text>

            {person.known_for_department && (
              <Text style={styles.department}>{person.known_for_department}</Text>
            )}

            <View style={styles.detailsContainer}>
              {person.birthday && (
                <View style={styles.detailItem}>
                  <Calendar size={14} color={COLORS.textSecondary} />
                  <Text style={styles.detailText}>
                    {formatDate(person.birthday)}
                    {age && ` (${age} ${person.deathday ? 'at death' : 'years old'})`}
                  </Text>
                </View>
              )}

              {person.place_of_birth && (
                <View style={styles.detailItem}>
                  <MapPin size={14} color={COLORS.textSecondary} />
                  <Text style={styles.detailText}>{person.place_of_birth}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* Biography */}
        {person.biography && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Biography</Text>
            <Text style={styles.biography} numberOfLines={bioExpanded ? undefined : 4}>
              {person.biography}
            </Text>
            {person.biography.length > 200 && (
              <TouchableOpacity
                onPress={() => setBioExpanded(!bioExpanded)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.readMore}>{bioExpanded ? 'Read less' : 'Read more'}</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Known For - Movies */}
        {knownForMovies.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Known For (Movies)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {knownForMovies.map((movie, index) => (
                <TouchableOpacity
                  key={`movie-${movie.id}-${index}`}
                  style={styles.creditCard}
                  onPress={() => handleMoviePress(movie.id)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <MediaImage
                    source={{
                      uri: getImageUrl(movie.poster_path, TMDB_IMAGE_SIZES.poster.small),
                    }}
                    style={styles.creditPoster}
                    contentFit="cover"
                  />
                  <Text style={styles.creditTitle} numberOfLines={2}>
                    {movie.title}
                  </Text>
                  <View style={styles.creditMeta}>
                    {movie.release_date && (
                      <Text style={styles.creditYear}>
                        {new Date(movie.release_date).getFullYear()}
                      </Text>
                    )}
                    {movie.vote_average > 0 && (
                      <>
                        {movie.release_date && <Text style={styles.creditYear}> • </Text>}
                        <View style={styles.creditRating}>
                          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                          <Text style={styles.creditRatingText}>
                            {movie.vote_average.toFixed(1)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Known For - TV Shows */}
        {knownForTV.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Known For (TV Shows)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {knownForTV.map((show, index) => (
                <TouchableOpacity
                  key={`tv-${show.id}-${index}`}
                  style={styles.creditCard}
                  onPress={() => handleTVPress(show.id)}
                  activeOpacity={ACTIVE_OPACITY}
                >
                  <MediaImage
                    source={{
                      uri: getImageUrl(show.poster_path, TMDB_IMAGE_SIZES.poster.small),
                    }}
                    style={styles.creditPoster}
                    contentFit="cover"
                  />
                  <Text style={styles.creditTitle} numberOfLines={2}>
                    {show.name}
                  </Text>
                  <View style={styles.creditMeta}>
                    {show.first_air_date && (
                      <Text style={styles.creditYear}>
                        {new Date(show.first_air_date).getFullYear()}
                      </Text>
                    )}
                    {show.vote_average > 0 && (
                      <>
                        {show.first_air_date && <Text style={styles.creditYear}> • </Text>}
                        <View style={styles.creditRating}>
                          <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                          <Text style={styles.creditRatingText}>
                            {show.vote_average.toFixed(1)}
                          </Text>
                        </View>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
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
  headerButton: {
    padding: SPACING.m,
    marginLeft: SPACING.s,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: BORDER_RADIUS.round,
    alignSelf: 'flex-start',
  },
  profileSection: {
    alignItems: 'center',
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  profileImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: SPACING.l,
    borderWidth: 4,
    borderColor: COLORS.surfaceLight,
  },
  profileInfo: {
    alignItems: 'center',
  },
  name: {
    fontSize: FONT_SIZE.xxl,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  department: {
    fontSize: FONT_SIZE.m,
    color: COLORS.primary,
    marginBottom: SPACING.m,
  },
  detailsContainer: {
    gap: SPACING.s,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  detailText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
  },
  section: {
    paddingHorizontal: SPACING.l,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: SPACING.m,
  },
  biography: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
    lineHeight: 24,
  },
  readMore: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.m,
    marginTop: SPACING.s,
    fontWeight: '600',
  },
  creditCard: {
    width: 120,
    marginRight: SPACING.m,
  },
  creditPoster: {
    width: 120,
    height: 180,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  creditTitle: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: 2,
  },
  creditYear: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  creditMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  creditRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  creditRatingText: {
    color: COLORS.text,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});
