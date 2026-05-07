import type { Episode, Season } from '@/src/api/tmdb';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useDeferredExpansion } from '@/src/hooks/useDeferredExpansion';
import type {
  MarkAllEpisodesWatchedParams,
  MarkAllEpisodesUnwatchedParams,
  MarkEpisodeUnwatchedParams,
  MarkEpisodeWatchedParams,
} from '@/src/hooks/useEpisodeTracking';
import { useSeasonProgress } from '@/src/hooks/useEpisodeTracking';
import type { RatingItem } from '@/src/services/RatingService';
import type { TVShowEpisodeTracking } from '@/src/types/episodeTracking';
import { hasEpisodeAired } from '@/src/utils/dateUtils';
import * as Haptics from 'expo-haptics';
import type { TFunction } from 'i18next';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';
import { EpisodeItem } from './EpisodeItem';
import { useSeasonScreenStyles } from './seasonScreenStyles';

export type SeasonWithEpisodes = Season & { episodes?: Episode[] };
const EMPTY_EPISODES: Episode[] = [];
export type BulkSeasonActionType = 'mark' | 'unmark' | null;

export interface BulkSeasonActionState {
  action: BulkSeasonActionType;
  seasonNumber: number | null;
  isPending: boolean;
}

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
  onMarkAllUnwatched: (params: MarkAllEpisodesUnwatchedParams) => void;
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
  allowUnreleasedEpisodeWatches: boolean;
  isPremium: boolean;
  currentListCount: number;
  showEpisodes?: boolean;
  bulkActionState?: BulkSeasonActionState;
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
    onMarkAllUnwatched,
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
    allowUnreleasedEpisodeWatches,
    isPremium,
    currentListCount,
    showEpisodes = true,
    bulkActionState,
    t,
  }) => {
    const { accentColor } = useAccentColor();
    const styles = useSeasonScreenStyles();
    const posterUrl = getImageUrl(season.poster_path, TMDB_IMAGE_SIZES.poster.small);
    const seasonEpisodes = season.episodes || EMPTY_EPISODES;
    const { progress } = useSeasonProgress(tvId, season.season_number, seasonEpisodes);
    const shouldShowEpisodeList = showEpisodes && isExpanded && seasonEpisodes.length > 0;

    // Defer episode rendering to show loading indicator immediately on expand
    const { shouldRenderContent, isLoading } = useDeferredExpansion(shouldShowEpisodeList);

    const markableEpisodes = useMemo(
      () =>
        seasonEpisodes.filter(
          (ep) => !!ep.air_date && (allowUnreleasedEpisodeWatches || hasEpisodeAired(ep.air_date))
        ),
      [allowUnreleasedEpisodeWatches, seasonEpisodes]
    );

    const watchedSeasonEpisodes = useMemo(
      () =>
        seasonEpisodes.filter((ep) => {
          const episodeKey = `${season.season_number}_${ep.episode_number}`;
          return !!episodeTracking?.episodes?.[episodeKey];
        }),
      [episodeTracking?.episodes, season.season_number, seasonEpisodes]
    );

    const allMarkableEpisodesWatched = useMemo(() => {
      if (markableEpisodes.length === 0) return false;

      return markableEpisodes.every((ep) => {
        const episodeKey = `${season.season_number}_${ep.episode_number}`;
        return !!episodeTracking?.episodes?.[episodeKey];
      });
    }, [episodeTracking?.episodes, markableEpisodes, season.season_number]);

    const hasBulkMarkableEpisodes = markableEpisodes.length > 0;
    const hasWatchedEpisodesToUnmark = watchedSeasonEpisodes.length > 0;
    const shouldOfferUnmarkAll =
      (markableEpisodes.length === 0 && hasWatchedEpisodesToUnmark) || allMarkableEpisodesWatched;
    const markAllUsesGenericCopy = markableEpisodes.some((ep) => !hasEpisodeAired(ep.air_date));
    const unmarkAllUsesGenericCopy = watchedSeasonEpisodes.some(
      (ep) => !hasEpisodeAired(ep.air_date)
    );

    const handleMarkAllPress = useCallback(() => {
      if (!hasBulkMarkableEpisodes && !hasWatchedEpisodesToUnmark) return;

      if (shouldOfferUnmarkAll) {
        // Unmark all episodes
        Alert.alert(
          t('watched.unmarkAllEpisodesTitle'),
          t(
            unmarkAllUsesGenericCopy
              ? 'watched.unmarkAllEpisodesConfirm'
              : 'watched.unmarkAllAiredEpisodesConfirm',
            {
              count: watchedSeasonEpisodes.length,
              seasonName: season.name || t('media.seasonNumber', { number: season.season_number }),
            }
          ),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('watched.unmarkAll'),
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                onMarkAllUnwatched({
                  tvShowId: tvId,
                  seasonNumber: season.season_number,
                  episodes: watchedSeasonEpisodes,
                });
              },
            },
          ]
        );
      } else {
        // Mark all episodes
        Alert.alert(
          t('watched.markAllEpisodesTitle'),
          t(
            markAllUsesGenericCopy
              ? 'watched.markAllEpisodesConfirm'
              : 'watched.markAllAiredEpisodesConfirm',
            {
              count: markableEpisodes.length,
              seasonName: season.name || t('media.seasonNumber', { number: season.season_number }),
            }
          ),
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('watched.markAll'),
              onPress: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

                onMarkAllWatched({
                  tvShowId: tvId,
                  seasonNumber: season.season_number,
                  episodes: markableEpisodes,
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
      hasBulkMarkableEpisodes,
      hasWatchedEpisodesToUnmark,
      shouldOfferUnmarkAll,
      unmarkAllUsesGenericCopy,
      watchedSeasonEpisodes,
      markAllUsesGenericCopy,
      markableEpisodes,
      season.season_number,
      season.name,
      tvId,
      showName,
      showPosterPath,
      onMarkAllWatched,
      onMarkAllUnwatched,
      t,
    ]);

    const isBulkActionPending =
      !!bulkActionState?.isPending &&
      bulkActionState.seasonNumber === season.season_number &&
      !!bulkActionState.action;

    return (
      <View
        style={[
          styles.seasonContainer,
          isExpanded && !showEpisodes && styles.seasonContainerExpandedHeaderOnly,
        ]}
      >
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
                  total={progress.progressTotalCount}
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
            {showEpisodes && isExpanded && (hasBulkMarkableEpisodes || hasWatchedEpisodesToUnmark) && (
              <TouchableOpacity
                style={[styles.markAllButton, isBulkActionPending && styles.markAllButtonDisabled]}
                onPress={handleMarkAllPress}
                disabled={isBulkActionPending}
                activeOpacity={ACTIVE_OPACITY}
                testID={`season-mark-all-button-${season.season_number}`}
              >
                {isBulkActionPending ? (
                  <ActivityIndicator
                    size="small"
                    color={COLORS.white}
                    testID={`season-mark-all-spinner-${season.season_number}`}
                  />
                ) : (
                  <Text style={styles.markAllText}>
                    {shouldOfferUnmarkAll ? t('watched.unmarkAll') : t('watched.markAll')}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            {isExpanded ? (
              <ChevronDown size={24} color={accentColor} />
            ) : (
              <ChevronRight size={24} color={COLORS.textSecondary} />
            )}
          </View>
        </TouchableOpacity>

        {shouldShowEpisodeList && (
          <View style={styles.episodesContainer}>
            {season.overview && <Text style={styles.seasonFullOverview}>{season.overview}</Text>}

            {isLoading && (
              <View style={styles.episodesLoadingContainer}>
                <ActivityIndicator size="large" color={accentColor} />
              </View>
            )}

            {shouldRenderContent &&
              seasonEpisodes.map((episode: Episode) => {
                const episodeKey = `${season.season_number}_${episode.episode_number}`;
                const isWatched = episodeTracking?.episodes?.[episodeKey];
                const isPending =
                  (markWatchedPending &&
                    markWatchedVariables?.episodeNumber === episode.episode_number &&
                    markWatchedVariables?.seasonNumber === season.season_number) ||
                  (markUnwatchedPending &&
                    markUnwatchedVariables?.episodeNumber === episode.episode_number &&
                    markUnwatchedVariables?.seasonNumber === season.season_number);

                const hasAired = hasEpisodeAired(episode.air_date);

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
                    allowUnreleasedEpisodeWatches={allowUnreleasedEpisodeWatches}
                    userRating={userRating}
                    formatDate={formatDate}
                    onPress={() => onEpisodePress(episode, season.season_number)}
                    onMarkWatched={() => {
                      // Check if this will complete the season
                      const willComplete =
                        progress && progress.progressTotalCount > 0
                          ? progress.watchedCount + 1 ===
                            (allowUnreleasedEpisodeWatches && !hasAired
                              ? progress.totalCount
                              : progress.progressTotalCount)
                          : false;

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
                            seasonEpisodes,
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
