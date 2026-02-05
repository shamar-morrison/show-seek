import type { Episode, Season } from '@/src/api/tmdb';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import type {
  MarkAllEpisodesWatchedParams,
  MarkEpisodeUnwatchedParams,
  MarkEpisodeWatchedParams,
} from '@/src/hooks/useEpisodeTracking';
import { useSeasonProgress } from '@/src/hooks/useEpisodeTracking';
import type { RatingItem } from '@/src/services/RatingService';
import type { TVShowEpisodeTracking } from '@/src/types/episodeTracking';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { EpisodeItem } from './EpisodeItem';
import { useSeasonScreenStyles } from './seasonScreenStyles';

export type SeasonWithEpisodes = Season & { episodes?: Episode[] };

export interface SeasonItemProps {
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
  markPreviousEpisodesWatched: boolean;
  isPremium: boolean;
  currentListCount: number;
  t: TFunction;
}

export const SeasonItem = memo<SeasonItemProps>(
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
    markPreviousEpisodesWatched,
    isPremium,
    currentListCount,
    t,
  }) => {
    const { accentColor } = useAccentColor();
    const styles = useSeasonScreenStyles();
    const posterUrl = getImageUrl(season.poster_path, TMDB_IMAGE_SIZES.poster.small);
    const { progress } = useSeasonProgress(tvId, season.season_number, season.episodes || []);

    const handleMarkAllPress = useCallback(() => {
      if (!season.episodes || season.episodes.length === 0) return;

      const today = new Date();
      const airedEpisodes = season.episodes.filter(
        (ep) => ep.air_date && new Date(ep.air_date) <= today
      );
      const hasAiredEpisodes = airedEpisodes.length > 0;

      if (!hasAiredEpisodes) return;

      const allAiredWatched =
        hasAiredEpisodes &&
        airedEpisodes.every((ep) => {
          const episodeKey = `${season.season_number}_${ep.episode_number}`;
          return episodeTracking?.episodes?.[episodeKey];
        });

      if (allAiredWatched) {
        // Unmark all episodes
        Alert.alert(
          t('watched.unmarkAllEpisodesTitle'),
          t('watched.unmarkAllAiredEpisodesConfirm', {
            count: airedEpisodes.length,
            seasonName: season.name || t('media.seasonNumber', { number: season.season_number }),
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('watched.unmarkAll'),
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                // Unmark each episode
                airedEpisodes.forEach((ep) => {
                  onMarkUnwatched({
                    tvShowId: tvId,
                    seasonNumber: season.season_number,
                    episodeNumber: ep.episode_number,
                  });
                });
              },
            },
          ]
        );
      } else {
        // Mark all episodes
        Alert.alert(
          t('watched.markAllEpisodesTitle'),
          t('watched.markAllAiredEpisodesConfirm', {
            count: airedEpisodes.length,
            seasonName: season.name || t('media.seasonNumber', { number: season.season_number }),
          }),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('watched.markAll'),
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
      }
    }, [
      season.episodes,
      season.season_number,
      season.name,
      episodeTracking,
      tvId,
      showName,
      showPosterPath,
      onMarkUnwatched,
      onMarkAllWatched,
      t,
    ]);

    // Calculate if all aired episodes are watched
    const allAiredWatched = (() => {
      if (!season.episodes || season.episodes.length === 0) return false;

      const today = new Date();
      const airedEpisodes = season.episodes.filter(
        (ep) => ep.air_date && new Date(ep.air_date) <= today
      );
      if (airedEpisodes.length === 0) return false;

      return airedEpisodes.every((ep) => {
        const episodeKey = `${season.season_number}_${ep.episode_number}`;
        return episodeTracking?.episodes?.[episodeKey];
      });
    })();

    const hasAiredEpisodes = (() => {
      if (!season.episodes || season.episodes.length === 0) return false;
      const today = new Date();
      return season.episodes.some((ep) => ep.air_date && new Date(ep.air_date) <= today);
    })();

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
              {season.name || t('media.seasonNumber', { number: season.season_number })}
            </Text>
            <Text style={styles.seasonMeta}>
              {t('media.numberOfEpisodes', {
                count: season.episode_count || season.episodes?.length || 0,
              })}
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
            {isExpanded && hasAiredEpisodes && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={handleMarkAllPress}
                activeOpacity={ACTIVE_OPACITY}
              >
                <Text style={styles.markAllText}>
                  {allAiredWatched ? t('watched.unmarkAll') : t('watched.markAll')}
                </Text>
              </TouchableOpacity>
            )}
            {isExpanded ? (
              <ChevronDown size={24} color={accentColor} />
            ) : (
              <ChevronRight size={24} color={COLORS.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {isExpanded && season.episodes && (
          <View style={styles.episodesContainer}>
            {season.overview && <Text style={styles.seasonFullOverview}>{season.overview}</Text>}

            {season.episodes.map((episode: Episode) => {
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

              // Find user rating for this episode
              const episodeDocId = `episode-${tvId}-${season.season_number}-${episode.episode_number}`;
              const userRatingItem = ratings?.find(
                (r) => r.id === episodeDocId && r.mediaType === 'episode'
              );
              const userRating = userRatingItem?.rating || 0;

              return (
                <EpisodeItem
                  key={episode.id}
                  episode={episode}
                  seasonNumber={season.season_number}
                  tvId={tvId}
                  showName={showName}
                  showPosterPath={showPosterPath}
                  isWatched={!!isWatched}
                  isPending={isPending}
                  hasAired={!!hasAired}
                  userRating={userRating}
                  formatDate={formatDate}
                  onPress={() => onEpisodePress(episode, season.season_number)}
                  onMarkWatched={() => {
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
                          isPremium,
                          currentListCount,
                        },
                        previousEpisodesOptions: {
                          seasonEpisodes: season.episodes || [],
                          shouldMarkPrevious: markPreviousEpisodesWatched,
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
                  }}
                  onMarkUnwatched={() => {
                    onMarkUnwatched({
                      tvShowId: tvId,
                      seasonNumber: season.season_number,
                      episodeNumber: episode.episode_number,
                    });
                  }}
                  t={t}
                  progress={progress ?? undefined}
                  showStatus={showStatus}
                  autoAddToWatching={autoAddToWatching}
                  listMembership={listMembership}
                  firstAirDate={firstAirDate}
                  voteAverage={voteAverage}
                />
              );
            })}
          </View>
        )}
      </View>
    );
  }
);

SeasonItem.displayName = 'SeasonItem';
