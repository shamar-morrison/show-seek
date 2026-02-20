import type { Episode } from '@/src/api/tmdb';
import { tmdbApi } from '@/src/api/tmdb';
import { EpisodeItem } from '@/src/components/tv/EpisodeItem';
import { SeasonItem, type BulkSeasonActionState } from '@/src/components/tv/SeasonItem';
import { useSeasonScreenStyles } from '@/src/components/tv/seasonScreenStyles';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import LoadingModal from '@/src/components/ui/LoadingModal';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useAccountRequired } from '@/src/hooks/useAccountRequired';
import {
  type MarkAllEpisodesUnwatchedParams,
  type MarkAllEpisodesWatchedParams,
  type MarkEpisodeUnwatchedParams,
  type MarkEpisodeWatchedParams,
  useMarkAllEpisodesUnwatched,
  useMarkAllEpisodesWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { useLists, useMediaLists } from '@/src/hooks/useLists';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useRatings } from '@/src/hooks/useRatings';
import {
  buildTVSeasonsListRows,
  getSeasonHeaderRowIndex,
  type TVSeasonsListRow,
} from '@/src/screens/tvSeasonsListRows';
import { errorStyles } from '@/src/styles/errorStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { FlashList, type FlashListRef, type ListRenderItemInfo } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ArrowLeft } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const SCROLL_INITIAL_DELAY = 300;
const SCROLL_RETRY_INTERVAL = 100;
const SCROLL_MAX_ATTEMPTS = 20;
type OptimisticBulkAction = { action: 'mark' | 'unmark'; seasonNumber: number } | null;

export default function TVSeasonsScreen() {
  const styles = useSeasonScreenStyles();
  const { id, season } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const currentTab = useCurrentTab();
  const tvId = Number(id);
  const targetSeasonNumber = season ? Number(season) : null;
  const [expandedSeason, setExpandedSeason] = useState<number | null>(() => {
    return targetSeasonNumber;
  });

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
  const markAllUnwatched = useMarkAllEpisodesUnwatched();

  // Auto-add to Watching list hooks
  const { preferences } = usePreferences();
  const { membership: listMembership } = useMediaLists(tvId);
  const { data: lists } = useLists();
  const { isPremium } = usePremium();

  // Calculate current count for 'currently-watching' list
  const currentlyWatchingList = lists?.find((l) => l.id === 'currently-watching');
  const currentListCount = currentlyWatchingList
    ? Object.keys(currentlyWatchingList.items || {}).length
    : 0;

  const { data: ratings } = useRatings();
  const isAccountRequired = useAccountRequired();

  // Progressive render: defer heavy content until navigation animation completes
  const { isReady } = useProgressiveRender();

  const listRef = useRef<FlashListRef<TVSeasonsListRow> | null>(null);
  const autoScrollAttemptsRef = useRef(0);
  const deferredBulkActionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hasScrolledToSeason, setHasScrolledToSeason] = useState(false);
  const [optimisticBulkAction, setOptimisticBulkAction] = useState<OptimisticBulkAction>(null);

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

  const handleMarkWatched = useCallback(
    (
      params: MarkEpisodeWatchedParams,
      callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void }
    ) => {
      if (isAccountRequired()) {
        return;
      }
      markWatched.mutate(params, callbacks);
    },
    [isAccountRequired, markWatched]
  );

  const handleMarkUnwatched = useCallback(
    (params: MarkEpisodeUnwatchedParams) => {
      if (isAccountRequired()) {
        return;
      }
      markUnwatched.mutate(params);
    },
    [isAccountRequired, markUnwatched]
  );

  const handleMarkAllWatched = useCallback(
    (params: MarkAllEpisodesWatchedParams) => {
      if (isAccountRequired()) {
        return;
      }

      const optimisticAction = {
        action: 'mark' as const,
        seasonNumber: params.seasonNumber,
      };
      setOptimisticBulkAction(optimisticAction);

      if (deferredBulkActionTimeoutRef.current) {
        clearTimeout(deferredBulkActionTimeoutRef.current);
      }

      deferredBulkActionTimeoutRef.current = setTimeout(() => {
        deferredBulkActionTimeoutRef.current = null;
        markAllWatched.mutate(params, {
          onSettled: () => {
            setOptimisticBulkAction((current) => {
              if (
                current?.action === optimisticAction.action &&
                current.seasonNumber === optimisticAction.seasonNumber
              ) {
                return null;
              }
              return current;
            });
          },
        });
      }, 0);
    },
    [isAccountRequired, markAllWatched]
  );

  const handleMarkAllUnwatched = useCallback(
    (params: MarkAllEpisodesUnwatchedParams) => {
      if (isAccountRequired()) {
        return;
      }

      const optimisticAction = {
        action: 'unmark' as const,
        seasonNumber: params.seasonNumber,
      };
      setOptimisticBulkAction(optimisticAction);

      if (deferredBulkActionTimeoutRef.current) {
        clearTimeout(deferredBulkActionTimeoutRef.current);
      }

      deferredBulkActionTimeoutRef.current = setTimeout(() => {
        deferredBulkActionTimeoutRef.current = null;
        markAllUnwatched.mutate(params, {
          onSettled: () => {
            setOptimisticBulkAction((current) => {
              if (
                current?.action === optimisticAction.action &&
                current.seasonNumber === optimisticAction.seasonNumber
              ) {
                return null;
              }
              return current;
            });
          },
        });
      }, 0);
    },
    [isAccountRequired, markAllUnwatched]
  );

  const toggleSeason = useCallback((seasonNumber: number) => {
    setExpandedSeason((current) => (current === seasonNumber ? null : seasonNumber));
  }, []);

  const formatDate = useCallback(
    (dateString: string | null) => {
      if (!dateString) return t('common.tba');
      return formatTmdbDate(dateString);
    },
    [t]
  );

  const show = tvQuery.data;
  const showName = show?.name ?? '';
  const showPosterPath = show?.poster_path ?? null;
  const showStatus = show?.status;
  const showFirstAirDate = show?.first_air_date;
  const showVoteAverage = show?.vote_average;
  const displayShowTitle = show
    ? getDisplayMediaTitle(show, !!preferences?.showOriginalTitles)
    : '';
  const seasons = seasonQueries.data || [];
  const seasonRows = useMemo(
    () => buildTVSeasonsListRows(seasons, expandedSeason),
    [seasons, expandedSeason]
  );
  const targetSeasonIndex = useMemo(
    () => getSeasonHeaderRowIndex(seasonRows, targetSeasonNumber),
    [seasonRows, targetSeasonNumber]
  );

  const bulkActionState = useMemo<BulkSeasonActionState>(() => {
    if (optimisticBulkAction) {
      return {
        action: optimisticBulkAction.action,
        seasonNumber: optimisticBulkAction.seasonNumber,
        isPending: true,
      };
    }

    if (markAllWatched.isPending) {
      return {
        action: 'mark',
        seasonNumber: markAllWatched.variables?.seasonNumber ?? null,
        isPending: true,
      };
    }

    if (markAllUnwatched.isPending) {
      return {
        action: 'unmark',
        seasonNumber: markAllUnwatched.variables?.seasonNumber ?? null,
        isPending: true,
      };
    }

    return {
      action: null,
      seasonNumber: null,
      isPending: false,
    };
  }, [
    optimisticBulkAction,
    markAllWatched.isPending,
    markAllWatched.variables,
    markAllUnwatched.isPending,
    markAllUnwatched.variables,
  ]);

  const isAnyBulkActionPending = bulkActionState.isPending;

  const loadingModalMessage =
    bulkActionState.action === 'unmark'
      ? `${t('watched.unmarkAll')}...`
      : `${t('watched.markAll')}...`;

  const episodeRatingsById = useMemo(() => {
    const map = new Map<string, number>();

    (ratings || []).forEach((rating) => {
      if (rating.mediaType === 'episode') {
        map.set(rating.id, rating.rating);
      }
    });

    return map;
  }, [ratings]);

  const seasonProgressBySeasonNumber = useMemo(() => {
    const progressMap = new Map<number, { watchedCount: number; totalAiredCount: number }>();
    const watchedEpisodes = episodeTracking?.episodes;

    if (!watchedEpisodes) {
      return progressMap;
    }

    const today = new Date();

    seasons.forEach((seasonData) => {
      const airedEpisodes = (seasonData.episodes || []).filter(
        (episode) => episode.air_date && new Date(episode.air_date) <= today
      );

      const watchedCount = airedEpisodes.filter((episode) => {
        const episodeKey = `${seasonData.season_number}_${episode.episode_number}`;
        return watchedEpisodes[episodeKey];
      }).length;

      progressMap.set(seasonData.season_number, {
        watchedCount,
        totalAiredCount: airedEpisodes.length,
      });
    });

    return progressMap;
  }, [seasons, episodeTracking?.episodes]);

  useEffect(() => {
    setHasScrolledToSeason(false);
    autoScrollAttemptsRef.current = 0;
  }, [tvId, targetSeasonNumber]);

  useEffect(() => {
    return () => {
      if (deferredBulkActionTimeoutRef.current) {
        clearTimeout(deferredBulkActionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!targetSeasonNumber || hasScrolledToSeason || targetSeasonIndex < 0 || seasonRows.length === 0) {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const tryScroll = async () => {
      if (isCancelled) {
        return;
      }

      if (!listRef.current) {
        if (autoScrollAttemptsRef.current >= SCROLL_MAX_ATTEMPTS) {
          if (!isCancelled) {
            console.warn(`Could not scroll to season ${targetSeasonNumber} - list not ready`);
            setHasScrolledToSeason(true);
          }
          return;
        }

        autoScrollAttemptsRef.current += 1;
        timeoutId = setTimeout(tryScroll, SCROLL_RETRY_INTERVAL);
        return;
      }

      try {
        await listRef.current.scrollToIndex({
          index: targetSeasonIndex,
          animated: true,
          viewPosition: 0,
        });
        if (!isCancelled) {
          setHasScrolledToSeason(true);
        }
      } catch {
        if (autoScrollAttemptsRef.current >= SCROLL_MAX_ATTEMPTS) {
          if (!isCancelled) {
            console.warn(`Could not scroll to season ${targetSeasonNumber} - list not ready`);
            setHasScrolledToSeason(true);
          }
          return;
        }

        autoScrollAttemptsRef.current += 1;
        timeoutId = setTimeout(tryScroll, SCROLL_RETRY_INTERVAL);
      }
    };

    timeoutId = setTimeout(tryScroll, SCROLL_INITIAL_DELAY);

    return () => {
      isCancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [targetSeasonNumber, hasScrolledToSeason, targetSeasonIndex, seasonRows.length]);

  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<TVSeasonsListRow>) => {
      if (item.type === 'season-header') {
        const seasonData = item.season;

        return (
          <SeasonItem
            season={seasonData}
            tvId={tvId}
            showName={showName}
            showPosterPath={showPosterPath}
            isExpanded={expandedSeason === seasonData.season_number}
            onToggle={() => toggleSeason(seasonData.season_number)}
            onEpisodePress={handleEpisodePress}
            onMarkWatched={handleMarkWatched}
            onMarkUnwatched={handleMarkUnwatched}
            onMarkAllWatched={handleMarkAllWatched}
            onMarkAllUnwatched={handleMarkAllUnwatched}
            episodeTracking={episodeTracking}
            markWatchedPending={markWatched.isPending}
            markUnwatchedPending={markUnwatched.isPending}
            markWatchedVariables={markWatched.variables}
            markUnwatchedVariables={markUnwatched.variables}
            formatDate={formatDate}
            ratings={ratings}
            showStatus={showStatus}
            autoAddToWatching={preferences.autoAddToWatching}
            listMembership={listMembership}
            firstAirDate={showFirstAirDate}
            voteAverage={showVoteAverage}
            markPreviousEpisodesWatched={!!preferences.markPreviousEpisodesWatched}
            isPremium={isPremium}
            currentListCount={currentListCount}
            showEpisodes={false}
            bulkActionState={bulkActionState}
            t={t}
          />
        );
      }

      if (item.type === 'season-overview') {
        return (
          <View style={styles.seasonExpandedContentRow}>
            <Text style={styles.seasonFullOverview}>{item.overview}</Text>
          </View>
        );
      }

      const seasonData = item.season;
      const episode = item.episode;
      const episodeKey = `${seasonData.season_number}_${episode.episode_number}`;
      const isWatched = !!episodeTracking?.episodes?.[episodeKey];
      const isEpisodePending =
        (markWatched.isPending &&
          markWatched.variables?.episodeNumber === episode.episode_number &&
          markWatched.variables?.seasonNumber === seasonData.season_number) ||
        (markUnwatched.isPending &&
          markUnwatched.variables?.episodeNumber === episode.episode_number &&
          markUnwatched.variables?.seasonNumber === seasonData.season_number);
      const hasAired = !!(episode.air_date && new Date(episode.air_date) <= new Date());
      const episodeDocId = `episode-${tvId}-${seasonData.season_number}-${episode.episode_number}`;
      const userRating = episodeRatingsById.get(episodeDocId) || 0;
      const progress = seasonProgressBySeasonNumber.get(seasonData.season_number);

      return (
        <View style={styles.seasonExpandedContentRow}>
          <EpisodeItem
            key={item.key}
            episode={episode}
            seasonNumber={seasonData.season_number}
            tvId={tvId}
            showName={showName}
            showPosterPath={showPosterPath}
            isWatched={isWatched}
            isPending={isEpisodePending}
            hasAired={hasAired}
            userRating={userRating}
            disableWatchButton={isAnyBulkActionPending}
            formatDate={formatDate}
            onPress={() => handleEpisodePress(episode, seasonData.season_number)}
            onMarkWatched={() => {
              const willComplete =
                !isWatched &&
                !!progress &&
                progress.totalAiredCount > 0 &&
                progress.watchedCount + 1 === progress.totalAiredCount;

              handleMarkWatched(
                {
                  tvShowId: tvId,
                  seasonNumber: seasonData.season_number,
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
                    shouldAutoAdd: preferences.autoAddToWatching,
                    listMembership,
                    firstAirDate: showFirstAirDate,
                    voteAverage: showVoteAverage,
                    isPremium,
                    currentListCount,
                  },
                  previousEpisodesOptions: {
                    seasonEpisodes: seasonData.episodes || [],
                    shouldMarkPrevious: !!preferences.markPreviousEpisodesWatched,
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
              handleMarkUnwatched({
                tvShowId: tvId,
                seasonNumber: seasonData.season_number,
                episodeNumber: episode.episode_number,
              });
            }}
            t={t}
            progress={progress}
            showStatus={showStatus}
            autoAddToWatching={preferences.autoAddToWatching}
            listMembership={listMembership}
            firstAirDate={showFirstAirDate}
            voteAverage={showVoteAverage}
          />
        </View>
      );
    },
    [
      tvId,
      showName,
      showPosterPath,
      showStatus,
      showFirstAirDate,
      showVoteAverage,
      expandedSeason,
      toggleSeason,
      handleEpisodePress,
      handleMarkWatched,
      handleMarkUnwatched,
      handleMarkAllWatched,
      handleMarkAllUnwatched,
      episodeTracking,
      markWatched.isPending,
      markWatched.variables,
      markUnwatched.isPending,
      markUnwatched.variables,
      formatDate,
      ratings,
      preferences.autoAddToWatching,
      preferences.markPreviousEpisodesWatched,
      listMembership,
      isPremium,
      currentListCount,
      bulkActionState,
      t,
      styles.seasonFullOverview,
      episodeRatingsById,
      seasonProgressBySeasonNumber,
      isAnyBulkActionPending,
    ]
  );

  if (!isReady || tvQuery.isLoading || seasonQueries.isLoading) {
    return <FullScreenLoading />;
  }

  if (tvQuery.isError || !show) {
    return (
      <View style={errorStyles.container}>
        <Text style={errorStyles.text}>{t('tvSeasons.failedToLoadSeasons')}</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
          activeOpacity={ACTIVE_OPACITY}
        >
          <Text style={styles.backButtonText}>{t('common.goBack')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={screenStyles.container}>
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
            {displayShowTitle}
          </Text>
          <Text style={styles.headerSubtitle}>{t('media.seasonsAndEpisodes')}</Text>
        </View>
      </SafeAreaView>

      <FlashList
        ref={listRef}
        data={seasonRows}
        renderItem={renderRow}
        keyExtractor={(item) => item.key}
        getItemType={(item) => item.type}
        drawDistance={600}
        contentContainerStyle={styles.seasonsListContent}
        showsVerticalScrollIndicator={false}
      />

      <LoadingModal visible={isAnyBulkActionPending} message={loadingModalMessage} />
    </View>
  );
}
