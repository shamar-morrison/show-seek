import type { Episode } from '@/src/api/tmdb';
import { markAsWatchedButtonStyles } from '@/src/components/detail/markAsWatchedButtonStyles';
import { COLORS, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
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
import {
  WatchHistoryActionsModal,
  type WatchHistoryActionsModalRef,
} from '@/src/components/WatchHistoryActionsModal';
import { Tick02Icon, ViewIcon } from '@hugeicons/core-free-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

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
  /** True while per-season episode details are still loading (reserves the slot). */
  isLoadingSeasons?: boolean;
  onShowToast: (message: string) => void;
}

/**
 * Pixel width for the progress fill overlay.
 * Percentage-string widths on absolutely-positioned children don't reliably
 * re-measure in Yoga when the parent is content-sized, so the fill is driven
 * by measured pixels instead. Pure function so the math stays unit-testable.
 */
export function computeFillWidthPx(buttonWidth: number, fillRatio: number): number {
  return buttonWidth > 0 ? buttonWidth * fillRatio : 0;
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
  isLoadingSeasons = false,
  onShowToast,
}: TVShowWatchButtonProps) {
  const styles = markAsWatchedButtonStyles;
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
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

  // Single source of truth for both the label state and the fill overlay.
  // The numerator is counted directly from the same markable∩tracked set that
  // isShowFullyWatched is defined over (watched.length + unwatched.length is
  // always exactly total), so the two can never drift apart.
  const showWatchProgress = useMemo(
    () => ({
      watched: watchedMarkableShowEpisodes.length,
      total: totalMarkableCount,
    }),
    [watchedMarkableShowEpisodes, totalMarkableCount]
  );

  const isShowFullyWatched =
    regularSeasons.length > 0 && unwatchedMarkableShowEpisodes.length === 0;
  const isPending = markShowAllWatched.isPending || markShowAllUnwatched.isPending;

  const cancelTokenRef = useRef<{ isCancelled: boolean }>({ isCancelled: false });
  const sheetRef = useRef<WatchHistoryActionsModalRef>(null);
  const [buttonWidth, setButtonWidth] = useState(0);
  const fillWidth = useRef(new Animated.Value(0)).current;
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

  // Long-press "Clear Watch History": works from any watched state (partial or
  // full), targeting whatever is currently watched. Reuses runMarkUnwatched verbatim,
  // so the same chunked mutation + LoadingModal progress/cancel wiring applies.
  const handleClearHistoryFromSheet = useCallback(() => {
    Alert.alert(
      t('watched.clearShowWatchHistoryTitle'),
      t('watched.clearShowWatchHistoryMessage', {
        count: watchedMarkableShowEpisodes.length,
      }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.clearAll'),
          style: 'destructive',
          onPress: () => {
            runMarkUnwatched();
          },
        },
      ]
    );
  }, [t, watchedMarkableShowEpisodes.length, runMarkUnwatched]);

  const handleButtonLongPress = useCallback(() => {
    if (isAccountRequired()) return;
    if (watchedMarkableShowEpisodes.length === 0 || isPending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    void sheetRef.current?.present();
  }, [isAccountRequired, watchedMarkableShowEpisodes.length, isPending]);

  const showProgressCount =
    !isShowFullyWatched && showWatchProgress.watched > 0;

  // Progress fill mirrors the shared ProgressBar semantics: accent while in
  // progress, success once complete. Kept translucent so button text stays
  // readable; rendered as an absolute overlay clipped by the button bounds.
  const fillRatio =
    showWatchProgress.total > 0
      ? Math.min(showWatchProgress.watched / showWatchProgress.total, 1)
      : 0;
  const fillColor = isShowFullyWatched
    ? hexToRGBA(COLORS.success, 0.3)
    : hexToRGBA(accentColor, 0.3);

  // Animate the pixel-measured fill toward its target on every ratio or layout
  // change. Routing through Animated's layout path (instead of swapping a
  // percentage string) sidesteps the Yoga abspos-percentage reflow issue.
  // NOTE: must stay above the early return below — every hook in this component
  // has to run unconditionally on every render (Rules of Hooks).
  useEffect(() => {
    Animated.timing(fillWidth, {
      toValue: computeFillWidthPx(buttonWidth, fillRatio),
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [buttonWidth, fillRatio, fillWidth]);

  if (regularSeasons.length === 0 || totalMarkableCount === 0) {
    // Genuine empty state (loaded, but nothing markable) — distinct from loading.
    if (!isLoadingSeasons) {
      return null;
    }
    // Loading state mirrors the movie button's treatment exactly: same shared
    // button shape with a spinner in place of content, disabled. Reserves the
    // slot so the loaded button doesn't pop in with a layout shift.
    return (
      <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.disabledButton,
          pressed && styles.pressedButton,
        ]}
        disabled
        testID="tv-show-watch-button"
      >
        <ActivityIndicator size="small" color={COLORS.white} />
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.button,
          isShowFullyWatched && styles.watchedButton,
          isPending && styles.disabledButton,
          pressed && styles.pressedButton,
          localStyles.clip,
        ]}
        onPress={isShowFullyWatched ? handleMarkUnwatchedPress : handleMarkWatchedPress}
        onLongPress={handleButtonLongPress}
        onLayout={(e) => {
          const nextWidth = e.nativeEvent.layout.width;
          setButtonWidth((prev) => (prev === nextWidth ? prev : nextWidth));
        }}
        disabled={isPending}
        testID="tv-show-watch-button"
      >
        {fillRatio > 0 ? (
          <Animated.View
            style={[localStyles.fill, { width: fillWidth, backgroundColor: fillColor }]}
            testID="tv-show-watch-fill"
          />
        ) : null}
        {isPending ? (
          <ActivityIndicator
            size="small"
            color={isShowFullyWatched ? COLORS.success : COLORS.white}
          />
        ) : (
          <>
            {isShowFullyWatched ? (
              <AppIcon icon={Tick02Icon} size={20} color={COLORS.success} />
            ) : (
              <AppIcon icon={ViewIcon} size={20} color={COLORS.white} />
            )}
            <Text style={[styles.buttonText, isShowFullyWatched && styles.watchedButtonText]}>
              {isShowFullyWatched
                ? t('media.markAsUnwatched')
                : showProgressCount
                  ? t('watched.episodesWatched', {
                      watched: showWatchProgress.watched,
                      total: showWatchProgress.total,
                    })
                  : t('media.markAsWatched')}
            </Text>
          </>
        )}
      </Pressable>
      <WatchHistoryActionsModal
        ref={sheetRef}
        showViewHistoryAction={false}
        onClearHistory={handleClearHistoryFromSheet}
        clearActionDescription={t('watched.clearShowWatchHistoryDescription')}
      />
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

const localStyles = StyleSheet.create({
  // Clips the absolute progress fill to the shared button's rounded corners.
  // Kept local so the shared style stays byte-identical for the movie button.
  clip: {
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
});
