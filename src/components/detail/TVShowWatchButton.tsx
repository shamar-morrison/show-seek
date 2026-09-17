import type { Episode } from '@/src/api/tmdb';
import { useDetailStyles } from '@/src/components/detail/detailStyles';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import {
  useMarkShowAllEpisodesUnwatched,
  useMarkShowAllEpisodesWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { useLists, useMediaLists } from '@/src/hooks/useLists';
import { usePreferences } from '@/src/hooks/usePreferences';
import { usePremium } from '@/src/context/PremiumContext';
import { getMarkableEpisodes } from '@/src/utils/episodeEligibility';
import { AppIcon } from '@/src/components/ui/AppIcon';
import LoadingModal from '@/src/components/ui/LoadingModal';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native';

export interface SeasonWithEpisodeDetails {
  season_number: number;
  episodes?: Episode[];
}

export interface TVShowWatchButtonProps {
  tvId: number;
  showName: string;
  showPosterPath: string | null;
  showStatus?: string;
  firstAirDate?: string;
  voteAverage?: number;
  genreIds?: number[];
  seasonsWithEpisodes: SeasonWithEpisodeDetails[];
  onShowToast: (message: string) => void;
}

/**
 * Show-wide Mark as Watched / Mark as Unwatched entry point for the TV detail screen.
 *
 * State is derived from episode data (no separate stored flag):
 * - 0% watched → "Mark as Watched", marks all markable episodes across seasons
 * - Partially watched → "Mark as Watched" + "{watched}/{total} episodes" count, marks only unwatched markable episodes
 * - Fully watched (same definition as TVSeasonsScreen's isShowFullyWatched) → "Mark as Unwatched", clears all watched episodes
 */
export function TVShowWatchButton({
  tvId,
  showName,
  showPosterPath,
  showStatus,
  firstAirDate,
  voteAverage,
  genreIds,
  seasonsWithEpisodes,
  onShowToast,
}: TVShowWatchButtonProps) {
  const styles = useDetailStyles();
  const { t } = useTranslation();
  const isAccountRequired = useAccountRequired();
  const { preferences } = usePreferences();
  const { data: episodeTracking } = useShowEpisodeTracking(tvId);
  const markShowAllWatched = useMarkShowAllEpisodesWatched();
  const markShowAllUnwatched = useMarkShowAllEpisodesUnwatched();
  const { membership: listMembership } = useMediaLists(tvId, 'tv');
  const { data: lists } = useLists();
  const { isPremium } = usePremium();

  const allowUnreleased = !!preferences?.allowUnreleasedEpisodeWatches;
  const trackedEpisodes = episodeTracking?.episodes || {};

  const regularSeasons = useMemo(
    () => seasonsWithEpisodes.filter((s) => s.season_number > 0),
    [seasonsWithEpisodes]
  );

  const markableBySeason = useMemo(
    () =>
      regularSeasons.map((seasonData) => ({
        seasonNumber: seasonData.season_number,
        episodes: getMarkableEpisodes(seasonData.episodes || [], allowUnreleased),
      })),
    [regularSeasons, allowUnreleased]
  );

  const totalMarkableCount = useMemo(
    () => markableBySeason.reduce((sum, s) => sum + s.episodes.length, 0),
    [markableBySeason]
  );

  const unwatchedMarkableShowEpisodes = useMemo(() => {
    const result: Array<{ seasonNumber: number; episode: Episode }> = [];
    markableBySeason.forEach(({ seasonNumber, episodes }) => {
      episodes.forEach((episode) => {
        const episodeKey = `${seasonNumber}_${episode.episode_number}`;
        if (!trackedEpisodes[episodeKey]) {
          result.push({ seasonNumber, episode });
        }
      });
    });
    return result;
  }, [markableBySeason, trackedEpisodes]);

  const watchedMarkableShowEpisodes = useMemo(() => {
    const result: Array<{ seasonNumber: number; episode: Episode }> = [];
    markableBySeason.forEach(({ seasonNumber, episodes }) => {
      episodes.forEach((episode) => {
        const episodeKey = `${seasonNumber}_${episode.episode_number}`;
        if (trackedEpisodes[episodeKey]) {
          result.push({ seasonNumber, episode });
        }
      });
    });
    return result;
  }, [markableBySeason, trackedEpisodes]);

  const watchedCount = totalMarkableCount - unwatchedMarkableShowEpisodes.length;
  const isShowFullyWatched =
    regularSeasons.length > 0 && unwatchedMarkableShowEpisodes.length === 0;
  const isPending = markShowAllWatched.isPending || markShowAllUnwatched.isPending;

  const cancelTokenRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });
  const [bulkProgress, setBulkProgress] = useState<{
    flow: 'mark' | 'unmark';
    isPending: boolean;
    isCancelling: boolean;
    current: number;
    total: number;
  } | null>(null);

  const handleCancelBulk = useCallback(() => {
    cancelTokenRef.current.isCancelled = true;
    setBulkProgress((current) => (current ? { ...current, isCancelling: true } : null));
  }, []);

  const buildBulkOptions = useCallback(
    (flow: 'mark' | 'unmark', total: number) => ({
      batchSize: 10,
      delayMs: 300,
      isCancelled: () => cancelTokenRef.current.isCancelled,
      onProgress: (doneCount: number, totalCount: number) => {
        setBulkProgress((current) =>
          current && current.flow === flow
            ? { ...current, current: doneCount, total: totalCount }
            : current
        );
      },
    }),
    []
  );

  const startBulkProgress = useCallback(
    (flow: 'mark' | 'unmark', total: number) => {
      cancelTokenRef.current = { isCancelled: false };
      setBulkProgress({ flow, isPending: true, isCancelling: false, current: 0, total });
    },
    []
  );

  const currentlyWatchingList = lists?.find((l) => l.id === 'currently-watching');
  const currentListCount = currentlyWatchingList
    ? Object.keys(currentlyWatchingList.items || {}).length
    : 0;

  const runMarkWatched = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startBulkProgress('mark', unwatchedMarkableShowEpisodes.length);
    markShowAllWatched.mutate(
      {
        tvShowId: tvId,
        episodesToMark: unwatchedMarkableShowEpisodes,
        showMetadata: { tvShowName: showName, posterPath: showPosterPath },
        autoAddOptions: {
          showStatus,
          shouldAutoAdd: preferences?.autoAddToWatching,
          listMembership,
          firstAirDate,
          voteAverage,
          genreIds,
          isPremium,
          currentListCount,
        },
        options: buildBulkOptions('mark', unwatchedMarkableShowEpisodes.length),
      },
      {
        onError: (error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          console.error('[TVShowWatchButton] Mark all as watched failed:', error);
          onShowToast(t('common.tryAgain'));
        },
        onSettled: () => {
          setBulkProgress(null);
        },
      }
    );
  }, [
    markShowAllWatched,
    tvId,
    unwatchedMarkableShowEpisodes,
    showName,
    showPosterPath,
    showStatus,
    preferences?.autoAddToWatching,
    listMembership,
    firstAirDate,
    voteAverage,
    genreIds,
    isPremium,
    currentListCount,
    buildBulkOptions,
    startBulkProgress,
    onShowToast,
    t,
  ]);

  const runMarkUnwatched = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    startBulkProgress('unmark', watchedMarkableShowEpisodes.length);
    markShowAllUnwatched.mutate(
      {
        tvShowId: tvId,
        episodesToUnmark: watchedMarkableShowEpisodes,
        options: buildBulkOptions('unmark', watchedMarkableShowEpisodes.length),
      },
      {
        onError: (error) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
          console.error('[TVShowWatchButton] Mark all as unwatched failed:', error);
          onShowToast(t('common.tryAgain'));
        },
        onSettled: () => {
          setBulkProgress(null);
        },
      }
    );
  }, [
    markShowAllUnwatched,
    watchedMarkableShowEpisodes,
    tvId,
    buildBulkOptions,
    startBulkProgress,
    onShowToast,
    t,
  ]);

  const handleMarkWatchedPress = useCallback(() => {
    if (isAccountRequired()) return;
    if (unwatchedMarkableShowEpisodes.length === 0 || isPending) return;

    const affectedSeasons = new Set(unwatchedMarkableShowEpisodes.map((e) => e.seasonNumber));
    if (affectedSeasons.size <= 1) {
      runMarkWatched();
      return;
    }

    const message = allowUnreleased
      ? t('watched.markAllShowEpisodesWithUnreleasedConfirm')
      : t('watched.markAllShowEpisodesConfirm', {
          count: unwatchedMarkableShowEpisodes.length,
        });
    Alert.alert(t('watched.markAllEpisodesTitle'), message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('watched.markAll'), onPress: runMarkWatched },
    ]);
  }, [
    isAccountRequired,
    unwatchedMarkableShowEpisodes,
    isPending,
    allowUnreleased,
    runMarkWatched,
    t,
  ]);

  const handleMarkUnwatchedPress = useCallback(() => {
    if (isAccountRequired()) return;
    if (watchedMarkableShowEpisodes.length === 0 || isPending) return;

    const affectedSeasons = new Set(watchedMarkableShowEpisodes.map((e) => e.seasonNumber));
    if (affectedSeasons.size <= 1) {
      runMarkUnwatched();
      return;
    }

    Alert.alert(
      t('watched.unmarkAllEpisodesTitle'),
      t('watched.unmarkAllShowEpisodesConfirm', { count: watchedMarkableShowEpisodes.length }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('watched.unmarkAll'), onPress: runMarkUnwatched },
      ]
    );
  }, [isAccountRequired, watchedMarkableShowEpisodes, isPending, runMarkUnwatched, t]);

  if (regularSeasons.length === 0 || totalMarkableCount === 0) {
    return null;
  }

  const showProgressCount = !isShowFullyWatched && watchedCount > 0;

  return (
    <>
      <View style={styles.trailerButtonRow}>
        <TouchableOpacity
          style={[styles.playButton, isPending && styles.disabledButton]}
          onPress={isShowFullyWatched ? handleMarkUnwatchedPress : handleMarkWatchedPress}
          disabled={isPending}
          activeOpacity={ACTIVE_OPACITY}
          testID="tv-show-watch-button"
        >
          {isPending ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <>
              {isShowFullyWatched ? (
                <AppIcon icon={Tick02Icon} size={18} color={COLORS.white} />
              ) : null}
              <Text style={styles.playButtonText}>
                {isShowFullyWatched ? t('media.markAsUnwatched') : t('media.markAsWatched')}
              </Text>
              {showProgressCount ? (
                <Text style={styles.playButtonText} testID="tv-show-watch-progress">
                  {t('watched.showEpisodesProgress', {
                    watched: watchedCount,
                    total: totalMarkableCount,
                  })}
                </Text>
              ) : null}
            </>
          )}
        </TouchableOpacity>
      </View>
      <LoadingModal
        visible={!!bulkProgress?.isPending}
        message={
          bulkProgress?.isCancelling
            ? t('watched.cancelling')
            : bulkProgress?.flow === 'unmark'
              ? `${t('watched.unmarkAll')}...`
              : `${t('watched.markAll')}...`
        }
        progressText={
          bulkProgress?.isPending
            ? t(
                bulkProgress.flow === 'unmark'
                  ? 'watched.unmarkAllShowEpisodesProgress'
                  : 'watched.markAllShowEpisodesProgress',
                {
                  current: bulkProgress.current,
                  total: bulkProgress.total,
                }
              )
            : undefined
        }
        onCancel={bulkProgress?.isPending ? handleCancelBulk : undefined}
        cancelText={t('common.cancel')}
        isCancelling={bulkProgress?.isCancelling}
      />
    </>
  );
}
