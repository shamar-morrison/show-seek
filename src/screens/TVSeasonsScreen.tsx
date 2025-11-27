import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, ChevronDown, ChevronRight, Star } from 'lucide-react-native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function TVSeasonsScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const tvId = Number(id);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(null);

  const tvQuery = useQuery({
    queryKey: ['tv', tvId],
    queryFn: () => tmdbApi.getTVShowDetails(tvId),
    enabled: !!tvId,
  });

  const seasonQueries = useQuery({
    queryKey: ['tv', tvId, 'all-seasons'],
    queryFn: async () => {
      const show = await tmdbApi.getTVShowDetails(tvId);
      const seasonPromises = show.seasons
        .filter((s) => s.season_number >= 0) // Include season 0 (specials)
        .map((s) => tmdbApi.getSeasonDetails(tvId, s.season_number));
      return Promise.all(seasonPromises);
    },
    enabled: !!tvId,
  });

  if (tvQuery.isLoading || seasonQueries.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (tvQuery.isError || !tvQuery.data) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>Failed to load seasons</Text>
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
  const seasons = seasonQueries.data || [];

  const toggleSeason = (seasonNumber: number) => {
    setExpandedSeason(expandedSeason === seasonNumber ? null : seasonNumber);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'TBA';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.back()}
          activeOpacity={ACTIVE_OPACITY}
        >
          <ArrowLeft size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {show.name}
          </Text>
          <Text style={styles.headerSubtitle}>Seasons & Episodes</Text>
        </View>
      </SafeAreaView>

      <ScrollView style={styles.scrollView}>
        {seasons.map((season) => {
          const isExpanded = expandedSeason === season.season_number;
          const posterUrl = getImageUrl(season.poster_path, TMDB_IMAGE_SIZES.poster.small);

          return (
            <View key={season.season_number} style={styles.seasonContainer}>
              <TouchableOpacity
                style={styles.seasonHeader}
                onPress={() => toggleSeason(season.season_number)}
                activeOpacity={ACTIVE_OPACITY}
              >
                <MediaImage
                  source={{ uri: posterUrl }}
                  style={styles.seasonPoster}
                  contentFit="cover"
                />

                <View style={styles.seasonInfo}>
                  <Text style={styles.seasonTitle}>
                    {season.name || `Season ${season.season_number}`}
                  </Text>
                  <Text style={styles.seasonMeta}>
                    {season.episode_count || season.episodes?.length || 0} Episodes
                    {season.air_date && ` • ${new Date(season.air_date).getFullYear()}`}
                  </Text>
                  {season.overview && !isExpanded && (
                    <Text style={styles.seasonOverview} numberOfLines={2}>
                      {season.overview}
                    </Text>
                  )}
                </View>

                {isExpanded ? (
                  <ChevronDown size={24} color={COLORS.primary} />
                ) : (
                  <ChevronRight size={24} color={COLORS.textSecondary} />
                )}
              </TouchableOpacity>

              {isExpanded && season.episodes && (
                <View style={styles.episodesContainer}>
                  {season.overview && (
                    <Text style={styles.seasonFullOverview}>{season.overview}</Text>
                  )}

                  {season.episodes.map((episode) => {
                    const stillUrl = getImageUrl(episode.still_path, '/w300');

                    return (
                      <View key={episode.id} style={styles.episodeCard}>
                        <MediaImage
                          source={{ uri: stillUrl }}
                          style={styles.episodeStill}
                          contentFit="cover"
                        />

                        <View style={styles.episodeInfo}>
                          <View style={styles.episodeHeader}>
                            <Text style={styles.episodeNumber}>
                              Episode {episode.episode_number}
                            </Text>
                            {episode.vote_average > 0 && (
                              <View style={styles.episodeRating}>
                                <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                                <Text style={styles.ratingText}>
                                  {episode.vote_average.toFixed(1)}
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text style={styles.episodeTitle} numberOfLines={1}>
                            {episode.name}
                          </Text>

                          <View style={styles.episodeMeta}>
                            {episode.air_date && (
                              <View style={styles.metaItem}>
                                <Calendar size={12} color={COLORS.textSecondary} />
                                <Text style={styles.metaText}>{formatDate(episode.air_date)}</Text>
                              </View>
                            )}
                            {episode.runtime && (
                              <Text style={styles.metaText}>• {episode.runtime}m</Text>
                            )}
                          </View>

                          {episode.overview && (
                            <Text style={styles.episodeOverview} numberOfLines={3}>
                              {episode.overview}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={{ height: 100 }} />
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.m,
    paddingTop: SPACING.s,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceLight,
  },
  headerButton: {
    padding: SPACING.s,
    marginRight: SPACING.m,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZE.l,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  headerSubtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  scrollView: {
    flex: 1,
  },
  seasonContainer: {
    marginBottom: SPACING.m,
    backgroundColor: COLORS.surface,
  },
  seasonHeader: {
    flexDirection: 'row',
    padding: SPACING.m,
    alignItems: 'center',
  },
  seasonPoster: {
    width: 70,
    height: 105,
    borderRadius: BORDER_RADIUS.s,
    marginRight: SPACING.m,
  },
  seasonInfo: {
    flex: 1,
  },
  seasonTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  seasonMeta: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  seasonOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  seasonFullOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
    paddingHorizontal: SPACING.m,
    paddingBottom: SPACING.m,
  },
  episodesContainer: {
    paddingTop: SPACING.s,
  },
  episodeCard: {
    marginBottom: SPACING.m,
    paddingHorizontal: SPACING.m,
  },
  episodeStill: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
    backgroundColor: COLORS.surfaceLight,
  },
  episodeInfo: {
    paddingHorizontal: SPACING.s,
  },
  episodeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  episodeNumber: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  episodeRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.warning,
    fontWeight: '600',
  },
  episodeTitle: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4,
  },
  episodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    marginBottom: SPACING.s,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  episodeOverview: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});
