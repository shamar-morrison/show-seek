import type { Episode, Season } from '@/src/api/tmdb';
import { getImageUrl, TMDB_IMAGE_SIZES, tmdbApi } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import {
  useMarkAllEpisodesWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useSeasonProgress,
  useShowEpisodeTracking,
  type MarkAllEpisodesWatchedParams,
  type MarkEpisodeUnwatchedParams,
  type MarkEpisodeWatchedParams,
} from '@/src/hooks/useEpisodeTracking';
import { useMediaLists } from '@/src/hooks/useLists';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useRatings } from '@/src/hooks/useRatings';
import type { RatingItem } from '@/src/services/RatingService';
import type { TVShowEpisodeTracking } from '@/src/types/episodeTracking';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, Check, ChevronDown, ChevronRight, Star } from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type SeasonWithEpisodes = Season & { episodes?: Episode[] };

const SCROLL_INITIAL_DELAY = 300;
const SCROLL_RETRY_INTERVAL = 100;
const SCROLL_MAX_ATTEMPTS = 20;

const SeasonItem = memo<{
  season: SeasonWithEpisodes;
  tvId: number;
  showName: string;
  showPosterPath: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onEpisodePress: (episode: Episode, seasonNumber: number) => void;
  onMarkWatched: (
    params: MarkEpisodeWatchedParams,
    callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
  ) => void;
  onMarkUnwatched: (params: MarkEpisodeUnwatchedParams) => void;
  onMarkAllWatched: (params: MarkAllEpisodesWatchedParams) => void;
  episodeTracking: TVShowEpisodeTracking | null | undefined;
  markWatchedPending: boolean;
  markUnwatchedPending: boolean;
  markWatchedVariables: MarkEpisodeWatchedParams | undefined;
  markUnwatchedVariables: MarkEpisodeUnwatchedParams | undefined;
  formatDate: (date: string | null) => string;
  ratings: RatingItem[] | undefined;
  showStatus: string | undefined;
  autoAddToWatching: boolean;
  listMembership: Record<string, boolean>;
  firstAirDate: string | undefined;
  voteAverage: number | undefined;
}>(
  ({
    season,
    tvId,
    showName,
    showPosterPath,
    isExpanded,
    onToggle,
    onEpisodePress,
    onMarkWatched,
    onMarkUnwatched,
    onMarkAllWatched,
    episodeTracking,
    markWatchedPending,
    markUnwatchedPending,
    markWatchedVariables,
    markUnwatchedVariables,
    formatDate,
    ratings,
    showStatus,
    autoAddToWatching,
    listMembership,
    firstAirDate,
    voteAverage,
  }) => {
    const posterUrl = getImageUrl(season.poster_path, TMDB_IMAGE_SIZES.poster.small);
    const { progress } = useSeasonProgress(tvId, season.season_number, season.episodes || []);

    return (
      <View key={season.season_number} style={styles.seasonContainer}>
        <TouchableOpacity
          style={styles.seasonHeader}
          onPress={onToggle}
          activeOpacity={ACTIVE_OPACITY}
        >
          <MediaImage source={{ uri: posterUrl }} style={styles.seasonPoster} contentFit="cover" />

          <View style={styles.seasonInfo}>
            <Text style={styles.seasonTitle}>
              {season.name || `Season ${season.season_number}`}
            </Text>
            <Text style={styles.seasonMeta}>
              {season.episode_count || season.episodes?.length || 0} Episodes
              {season.air_date && ` • ${new Date(season.air_date).getFullYear()}`}
            </Text>
            {progress && (
              <View style={styles.seasonProgressContainer}>
                <ProgressBar
                  current={progress.watchedCount}
                  total={progress.totalAiredCount}
                  height={4}
                  showLabel={true}
                />
              </View>
            )}
            {season.overview && !isExpanded && !progress && (
              <Text style={styles.seasonOverview} numberOfLines={2}>
                {season.overview}
              </Text>
            )}
          </View>

          <View style={styles.seasonActions}>
            {isExpanded &&
              season.episodes &&
              season.episodes.length > 0 &&
              (() => {
                const today = new Date();
                const airedEpisodes = season.episodes.filter(
                  (ep) => ep.air_date && new Date(ep.air_date) <= today
                );
                const hasAiredEpisodes = airedEpisodes.length > 0;

                return hasAiredEpisodes ? (
                  <TouchableOpacity
                    style={styles.markAllButton}
                    onPress={() => {
                      Alert.alert(
                        'Mark All as Watched',
                        `Mark all ${airedEpisodes.length} aired episode${airedEpisodes.length !== 1 ? 's' : ''} in ${season.name} as watched?`,
                        [
                          { text: 'Cancel', style: 'cancel' },
                          {
                            text: 'Mark All',
                            onPress: () => {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                              onMarkAllWatched({
                                tvShowId: tvId,
                                seasonNumber: season.season_number,
                                episodes: airedEpisodes,
                                showMetadata: {
                                  tvShowName: showName,
                                  posterPath: showPosterPath,
                                },
                              });
                            },
                          },
                        ]
                      );
                    }}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    <Text style={styles.markAllText}>Mark All</Text>
                  </TouchableOpacity>
                ) : null;
              })()}
            {isExpanded ? (
              <ChevronDown size={24} color={COLORS.primary} />
            ) : (
              <ChevronRight size={24} color={COLORS.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && season.episodes && (
          <View style={styles.episodesContainer}>
            {season.overview && <Text style={styles.seasonFullOverview}>{season.overview}</Text>}

            {season.episodes.map((episode: Episode) => {
              const stillUrl = getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.small);
              const episodeKey = `${season.season_number}_${episode.episode_number}`;
              const isWatched = episodeTracking?.episodes?.[episodeKey];
              const isPending =
                (markWatchedPending &&
                  markWatchedVariables?.episodeNumber === episode.episode_number &&
                  markWatchedVariables?.seasonNumber === season.season_number) ||
                (markUnwatchedPending &&
                  markUnwatchedVariables?.episodeNumber === episode.episode_number &&
                  markUnwatchedVariables?.seasonNumber === season.season_number);

              const hasAired = episode.air_date && new Date(episode.air_date) <= new Date();
              const isDisabled = isPending || (!isWatched && !hasAired);

              // Find user rating for this episode
              const episodeDocId = `episode-${tvId}-${season.season_number}-${episode.episode_number}`;
              const userRatingItem = ratings?.find(
                (r) => r.id === episodeDocId && r.mediaType === 'episode'
              );
              const userRating = userRatingItem?.rating || 0;

              return (
                <View key={episode.id} style={styles.episodeCard}>
                  {/* Wrap episode content in TouchableOpacity for navigation */}
                  <TouchableOpacity
                    activeOpacity={ACTIVE_OPACITY}
                    onPress={() => onEpisodePress(episode, season.season_number)}
                  >
                    <View style={styles.episodeStillContainer}>
                      {isWatched && (
                        <View style={styles.watchedOverlay}>
                          <Check size={24} color={COLORS.success} />
                        </View>
                      )}
                      <MediaImage
                        source={{ uri: stillUrl }}
                        style={[styles.episodeStill, isWatched && styles.episodeStillWatched]}
                        contentFit="cover"
                      />
                    </View>

                    <View style={styles.episodeInfo}>
                      <View style={styles.episodeHeader}>
                        <Text style={styles.episodeNumber}>Episode {episode.episode_number}</Text>
                        <View style={styles.ratingsContainer}>
                          {/* User Rating */}
                          {userRating > 0 && (
                            <View style={styles.episodeRating}>
                              <Star size={12} color={COLORS.primary} fill={COLORS.primary} />
                              <Text style={[styles.ratingText, { color: COLORS.primary }]}>
                                {userRating.toFixed(1)}
                              </Text>
                            </View>
                          )}
                          {/* TMDB Rating */}
                          {episode.vote_average > 0 && (
                            <View style={styles.episodeRating}>
                              <Star size={12} color={COLORS.warning} fill={COLORS.warning} />
                              <Text style={styles.ratingText}>
                                {episode.vote_average.toFixed(1)}
                              </Text>
                            </View>
                          )}
                        </View>
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
                  </TouchableOpacity>

                  {/* Watch button OUTSIDE TouchableOpacity to prevent navigation */}
                  <TouchableOpacity
                    style={[
                      styles.watchButton,
                      isWatched && styles.watchedButton,
                      isDisabled && styles.disabledButton,
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

                      if (isWatched) {
                        onMarkUnwatched({
                          tvShowId: tvId,
                          seasonNumber: season.season_number,
                          episodeNumber: episode.episode_number,
                        });
                      } else {
                        // Check if this will complete the season
                        const willComplete =
                          progress && progress.watchedCount + 1 === progress.totalAiredCount;

                        onMarkWatched(
                          {
                            tvShowId: tvId,
                            seasonNumber: season.season_number,
                            episodeNumber: episode.episode_number,
                            episodeData: {
                              episodeId: episode.id,
                              episodeName: episode.name,
                              episodeAirDate: episode.air_date,
                            },
                            showMetadata: {
                              tvShowName: showName,
                              posterPath: showPosterPath,
                            },
                            autoAddOptions: {
                              showStatus,
                              shouldAutoAdd: autoAddToWatching,
                              listMembership,
                              firstAirDate,
                              voteAverage,
                            },
                          },
                          {
                            onSuccess: () => {
                              if (willComplete) {
                                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              }
                            },
                            onError: (error) => {
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                              console.error('Error marking episode as watched:', error);
                            },
                          }
                        );
                      }
                    }}
                    disabled={isDisabled}
                    activeOpacity={ACTIVE_OPACITY}
                  >
                    {isPending ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Text style={styles.watchButtonText}>
                        {isWatched
                          ? 'Mark as Unwatched'
                          : !hasAired
                            ? 'Not Yet Aired'
                            : 'Mark as Watched'}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </View>
    );
  }
);

SeasonItem.displayName = 'SeasonItem';

export default function TVSeasonsScreen() {
  const { id, season } = useLocalSearchParams();
  const router = useRouter();
  const currentTab = useCurrentTab();
  const tvId = Number(id);
  const scrollViewRef = useRef<ScrollView>(null);
  const seasonRefs = useRef<Map<number, { y: number; height: number }>>(new Map());
  const [expandedSeason, setExpandedSeason] = useState<number | null>(() => {
    return season ? Number(season) : null;
  });
  const [hasScrolledToSeason, setHasScrolledToSeason] = useState(false);

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

  const { data: episodeTracking } = useShowEpisodeTracking(tvId);
  const markWatched = useMarkEpisodeWatched();
  const markUnwatched = useMarkEpisodeUnwatched();
  const markAllWatched = useMarkAllEpisodesWatched();
  const { requireAuth, AuthGuardModal } = useAuthGuard();

  // Auto-add to Watching list hooks
  const { preferences } = usePreferences();
  const { membership: listMembership } = useMediaLists(tvId);

  const { data: ratings } = useRatings();

  // Auto-scroll to selected season when data is loaded and layout is complete
  useEffect(() => {
    if (!season || hasScrolledToSeason || !seasonQueries.data || seasonQueries.data.length === 0) {
      return;
    }

    const seasonNumber = Number(season);
    const seasonExists = seasonQueries.data.some((s) => s.season_number === seasonNumber);

    if (!seasonExists) {
      console.warn(`Season ${seasonNumber} not found in TV show data`);
      setHasScrolledToSeason(true);
      return;
    }

    // Retry mechanism to wait for layout measurements
    let attempts = 0;
    const maxAttempts = SCROLL_MAX_ATTEMPTS; // Try for up to 2 seconds (20 * 100ms)
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const tryScroll = () => {
      if (isCancelled) return;

      const seasonLayout = seasonRefs.current.get(seasonNumber);

      if (seasonLayout && scrollViewRef.current) {
        // Layout is ready, perform scroll
        const scrollToY = Math.max(0, seasonLayout.y - 20);

        scrollViewRef.current.scrollTo({
          y: scrollToY,
          animated: true,
        });

        setHasScrolledToSeason(true);
      } else if (attempts < maxAttempts) {
        // Layout not ready yet, try again
        attempts++;
        timeoutId = setTimeout(tryScroll, SCROLL_RETRY_INTERVAL);
      } else {
        // Give up after max attempts
        console.warn(`Could not scroll to season ${seasonNumber} - layout not measured`);
        setHasScrolledToSeason(true);
      }
    };

    // Start trying after a short initial delay to let React render
    timeoutId = setTimeout(tryScroll, SCROLL_INITIAL_DELAY);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [season, hasScrolledToSeason, seasonQueries.data]);

  const handleEpisodePress = useCallback(
    (episode: Episode, seasonNumber: number) => {
      if (!currentTab) {
        console.warn('Cannot navigate to episode: currentTab is null');
        return;
      }
      const path = `/(tabs)/${currentTab}/tv/${tvId}/season/${seasonNumber}/episode/${episode.episode_number}`;
      router.push(path as any);
    },
    [tvId, currentTab, router]
  );

  // Auth-guarded callbacks for episode tracking
  const handleMarkWatched = useCallback(
    (
      params: MarkEpisodeWatchedParams,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      requireAuth(() => {
        markWatched.mutate(params, callbacks);
      }, 'Sign in to track your watched episodes');
    },
    [requireAuth, markWatched]
  );

  const handleMarkUnwatched = useCallback(
    (params: MarkEpisodeUnwatchedParams) => {
      requireAuth(() => {
        markUnwatched.mutate(params);
      }, 'Sign in to track your watched episodes');
    },
    [requireAuth, markUnwatched]
  );

  const handleMarkAllWatched = useCallback(
    (params: MarkAllEpisodesWatchedParams) => {
      requireAuth(() => {
        markAllWatched.mutate(params);
      }, 'Sign in to track your watched episodes');
    },
    [requireAuth, markAllWatched]
  );

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

      <ScrollView ref={scrollViewRef} style={styles.scrollView}>
        {seasons.map((season) => (
          <View
            key={season.season_number}
            onLayout={(event) => {
              const { y, height } = event.nativeEvent.layout;
              seasonRefs.current.set(season.season_number, { y, height });
            }}
          >
            <SeasonItem
              season={season}
              tvId={tvId}
              showName={show.name}
              showPosterPath={show.poster_path}
              isExpanded={expandedSeason === season.season_number}
              onToggle={() => toggleSeason(season.season_number)}
              onEpisodePress={handleEpisodePress}
              onMarkWatched={handleMarkWatched}
              onMarkUnwatched={handleMarkUnwatched}
              onMarkAllWatched={handleMarkAllWatched}
              episodeTracking={episodeTracking}
              markWatchedPending={markWatched.isPending}
              markUnwatchedPending={markUnwatched.isPending}
              markWatchedVariables={markWatched.variables}
              markUnwatchedVariables={markUnwatched.variables}
              formatDate={formatDate}
              ratings={ratings}
              showStatus={show.status}
              autoAddToWatching={preferences.autoAddToWatching}
              listMembership={listMembership}
              firstAirDate={show.first_air_date}
              voteAverage={show.vote_average}
            />
          </View>
        ))}
      </ScrollView>
      {AuthGuardModal}
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
    marginRight: SPACING.s,
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
  seasonProgressContainer: {
    marginTop: SPACING.s,
  },
  seasonActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
  },
  markAllButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.xs,
    paddingHorizontal: SPACING.s,
    borderRadius: BORDER_RADIUS.s,
  },
  markAllText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
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
  ratingsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
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
  episodeStillContainer: {
    position: 'relative',
  },
  watchedOverlay: {
    position: 'absolute',
    top: SPACING.s,
    right: SPACING.s,
    backgroundColor: COLORS.success,
    borderRadius: BORDER_RADIUS.round,
    padding: SPACING.xs,
    zIndex: 1,
  },
  episodeStillWatched: {
    opacity: 0.5,
  },
  watchButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.s,
    paddingHorizontal: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    alignItems: 'center',
    marginTop: SPACING.s,
  },
  watchedButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.success,
  },
  disabledButton: {
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.5,
  },
  watchButtonText: {
    color: COLORS.white,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
