import type { Episode } from '@/src/api/tmdb';
import { tmdbApi } from '@/src/api/tmdb';
import { SeasonItem } from '@/src/components/tv/SeasonItem';
import { useSeasonScreenStyles } from '@/src/components/tv/seasonScreenStyles';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { ACTIVE_OPACITY, COLORS } from '@/src/constants/theme';
import { usePremium } from '@/src/context/PremiumContext';
import { useAuthGuard } from '@/src/hooks/useAuthGuard';
import {
  useMarkAllEpisodesWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
  type MarkAllEpisodesWatchedParams,
  type MarkEpisodeUnwatchedParams,
  type MarkEpisodeWatchedParams,
} from '@/src/hooks/useEpisodeTracking';
import { useLists, useMediaLists } from '@/src/hooks/useLists';
import { useCurrentTab } from '@/src/hooks/useNavigation';
import { usePreferences } from '@/src/hooks/usePreferences';
import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { useRatings } from '@/src/hooks/useRatings';
import { useSeasonScroll } from '@/src/hooks/useSeasonScroll';
import { errorStyles } from '@/src/styles/errorStyles';
import { screenStyles } from '@/src/styles/screenStyles';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import { getDisplayMediaTitle } from '@/src/utils/mediaTitle';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TVSeasonsScreen() {
  const styles = useSeasonScreenStyles();
  const { id, season } = useLocalSearchParams();
  const router = useRouter();
  const { t } = useTranslation();
  const currentTab = useCurrentTab();
  const tvId = Number(id);
  const [expandedSeason, setExpandedSeason] = useState<number | null>(() => {
    return season ? Number(season) : null;
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
  const { requireAuth, AuthGuardModal } = useAuthGuard();

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

  // Progressive render: defer heavy content until navigation animation completes
  const { isReady } = useProgressiveRender();

  // Auto-scroll hook
  const { scrollViewRef, getSeasonLayoutHandler } = useSeasonScroll({
    targetSeason: season ? Number(season) : null,
    seasonCount: seasonQueries.data?.length || 0,
    enabled: !!seasonQueries.data && seasonQueries.data.length > 0,
  });

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
      }, t('authGuards.trackEpisodes'));
    },
    [requireAuth, markWatched, t]
  );

  const handleMarkUnwatched = useCallback(
    (params: MarkEpisodeUnwatchedParams) => {
      requireAuth(() => {
        markUnwatched.mutate(params);
      }, t('authGuards.trackEpisodes'));
    },
    [requireAuth, markUnwatched, t]
  );

  const handleMarkAllWatched = useCallback(
    (params: MarkAllEpisodesWatchedParams) => {
      requireAuth(() => {
        markAllWatched.mutate(params);
      }, t('authGuards.trackEpisodes'));
    },
    [requireAuth, markAllWatched, t]
  );

  if (!isReady || tvQuery.isLoading || seasonQueries.isLoading) {
    return <FullScreenLoading />;
  }

  if (tvQuery.isError || !tvQuery.data) {
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

  const show = tvQuery.data;
  const displayShowTitle = getDisplayMediaTitle(show, !!preferences?.showOriginalTitles);
  const seasons = seasonQueries.data || [];

  const toggleSeason = (seasonNumber: number) => {
    setExpandedSeason(expandedSeason === seasonNumber ? null : seasonNumber);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.tba');
    return formatTmdbDate(dateString);
  };

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

      <ScrollView ref={scrollViewRef} style={styles.scrollView}>
        {seasons.map((seasonData) => (
          <View
            key={seasonData.season_number}
            onLayout={getSeasonLayoutHandler(seasonData.season_number)}
          >
            <SeasonItem
              season={seasonData}
              tvId={tvId}
              showName={show.name}
              showPosterPath={show.poster_path}
              isExpanded={expandedSeason === seasonData.season_number}
              onToggle={() => toggleSeason(seasonData.season_number)}
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
              markPreviousEpisodesWatched={!!preferences.markPreviousEpisodesWatched}
              isPremium={isPremium}
              currentListCount={currentListCount}
              t={t}
            />
          </View>
        ))}
      </ScrollView>
      {AuthGuardModal}
    </View>
  );
}
