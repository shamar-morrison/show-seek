import { tmdbApi, type TVShowDetails } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';
import { InProgressShow, WatchedEpisode } from '@/src/types/episodeTracking';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const RETRY_COUNT = 2;

/**
 * Maximum number of seasons to fetch per show.
 * We only need the recent seasons to find the next episode and estimate time remaining.
 */
const MAX_SEASONS_TO_FETCH = 2;

const compareWatchedEpisodes = (left: WatchedEpisode, right: WatchedEpisode): number => {
  if (left.seasonNumber !== right.seasonNumber) {
    return left.seasonNumber - right.seasonNumber;
  }

  return left.episodeNumber - right.episodeNumber;
};

const buildSeasonCounts = (showDetails: TVShowDetails): Array<[number, number]> =>
  showDetails.seasons
    .filter((season) => season.season_number > 0 && (season.episode_count ?? 0) > 0)
    .sort((left, right) => left.season_number - right.season_number)
    .map((season) => [season.season_number, season.episode_count ?? 0]);

const getEpisodePosition = (
  seasonCounts: Array<[number, number]>,
  seasonNumber: number,
  episodeNumber: number
): number => {
  let position = 0;

  seasonCounts.forEach(([season, count]) => {
    if (season < seasonNumber) {
      position += count;
    }
  });

  const seasonCount = seasonCounts.find(([season]) => season === seasonNumber)?.[1];
  const clampedEpisodeNumber =
    seasonCount !== undefined
      ? Math.min(Math.max(episodeNumber, 0), seasonCount)
      : Math.max(episodeNumber, 0);

  return position + clampedEpisodeNumber;
};

const resolveLastAiredEpisode = (
  showDetails: TVShowDetails,
  today: Date
): { episodeNumber: number; seasonNumber: number } | null => {
  const lastEpisodeToAir = showDetails.last_episode_to_air;
  if (
    lastEpisodeToAir &&
    lastEpisodeToAir.season_number > 0 &&
    lastEpisodeToAir.episode_number > 0 &&
    lastEpisodeToAir.air_date &&
    new Date(lastEpisodeToAir.air_date) <= today
  ) {
    return {
      seasonNumber: lastEpisodeToAir.season_number,
      episodeNumber: lastEpisodeToAir.episode_number,
    };
  }

  const fallbackSeason = showDetails.seasons
    .filter((season) => season.season_number > 0 && season.air_date && new Date(season.air_date) <= today)
    .sort((left, right) => right.season_number - left.season_number)[0];

  if (!fallbackSeason || (fallbackSeason.episode_count ?? 0) <= 0) {
    return null;
  }

  return {
    seasonNumber: fallbackSeason.season_number,
    episodeNumber: fallbackSeason.episode_count ?? 0,
  };
};

const getNextEpisodeAfter = (
  seasonCounts: Array<[number, number]>,
  currentSeason: number,
  currentEpisode: number
): { episode: number; season: number } | null => {
  const currentSeasonIndex = seasonCounts.findIndex(([season]) => season === currentSeason);

  if (currentSeasonIndex >= 0) {
    const [, episodeCount] = seasonCounts[currentSeasonIndex];
    if (currentEpisode < episodeCount) {
      return {
        season: currentSeason,
        episode: currentEpisode + 1,
      };
    }

    for (let index = currentSeasonIndex + 1; index < seasonCounts.length; index += 1) {
      const [season, count] = seasonCounts[index];
      if (count > 0) {
        return {
          season,
          episode: 1,
        };
      }
    }

    return null;
  }

  const fallbackSeason = seasonCounts.find(([season, count]) => season > currentSeason && count > 0);
  return fallbackSeason
    ? {
        season: fallbackSeason[0],
        episode: 1,
      }
    : null;
};

const isShowStillActive = (showDetails: TVShowDetails): boolean =>
  showDetails.status === 'Returning Series' ||
  showDetails.status === 'In Production' ||
  Boolean(showDetails.next_episode_to_air);

/**
 * Hook to fetch and compute currently watching shows with optimized React Query caching.
 *
 * Performance optimizations:
 * - Only fetches the 2 most recent seasons (containing last watched episode)
 * - Uses showDetails.episode_run_time for estimated time remaining
 * - React Query caches and deduplicates requests
 */
export function useCurrentlyWatching() {
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;

  // 1. Fetch all tracking docs from Firestore
  const trackingQuery = useQuery({
    queryKey: ['episodeTracking', 'allShows', userId],
    queryFn: () => episodeTrackingService.getAllWatchedShows(userId!),
    enabled: !!userId,
    staleTime: STALE_TIME,
    retry: RETRY_COUNT,
  });

  // 2. Filter to shows with watched episodes and extract metadata
  const activeShowsWithInfo = useMemo(() => {
    if (!trackingQuery.data) return [];

    return trackingQuery.data
      .filter((show) => Object.keys(show.episodes).length > 0)
      .map((show) => {
        const episodes = Object.values(show.episodes).filter((episode) => episode.seasonNumber > 0);
        if (episodes.length === 0) return null;
        const sortedWatched = [...episodes].sort(compareWatchedEpisodes);
        const furthestWatched = sortedWatched[sortedWatched.length - 1];

        return {
          trackingDoc: show,
          furthestWatched,
          tvShowId: furthestWatched.tvShowId,
          maxWatchedSeason: furthestWatched.seasonNumber,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [trackingQuery.data]);

  const tvShowIds = useMemo(
    () => activeShowsWithInfo.map((item) => item.tvShowId),
    [activeShowsWithInfo]
  );

  // 3. Fetch TV show details for each active show
  const showDetailsQueries = useQueries({
    queries: tvShowIds.map((tvShowId) => ({
      queryKey: ['tv', tvShowId],
      queryFn: () => tmdbApi.getTVShowDetails(tvShowId),
      enabled: !!userId && tvShowIds.length > 0,
      staleTime: STALE_TIME,
      retry: RETRY_COUNT,
    })),
  });

  // 4. Build optimized season queries - only fetch relevant seasons
  const seasonQueries = useMemo(() => {
    const queries: { tvShowId: number; seasonNumber: number }[] = [];

    showDetailsQueries.forEach((query, index) => {
      if (!query.data) return;

      const tvShowId = tvShowIds[index];
      const showInfo = activeShowsWithInfo[index];
      const maxWatchedSeason = showInfo.maxWatchedSeason;

      // Get aired seasons only
      const airedSeasons = query.data.seasons
        .filter((s) => s.season_number > 0 && s.air_date && new Date(s.air_date) <= new Date())
        .sort((a, b) => a.season_number - b.season_number);

      if (airedSeasons.length === 0) return;

      // Only fetch seasons around where the user is watching
      // This includes: the season they're in + the next season (if it exists)
      const relevantSeasons = airedSeasons.filter(
        (s) =>
          s.season_number >= maxWatchedSeason &&
          s.season_number <= maxWatchedSeason + MAX_SEASONS_TO_FETCH - 1
      );

      // If no seasons found (edge case), just take the last 2 aired seasons
      const seasonsToFetch =
        relevantSeasons.length > 0 ? relevantSeasons : airedSeasons.slice(-MAX_SEASONS_TO_FETCH);

      seasonsToFetch.forEach((season) => {
        queries.push({ tvShowId, seasonNumber: season.season_number });
      });
    });

    return queries;
  }, [showDetailsQueries, tvShowIds, activeShowsWithInfo]);

  // 5. Fetch season details for relevant seasons only
  const seasonDetailsQueries = useQueries({
    queries: seasonQueries.map(({ tvShowId, seasonNumber }) => ({
      queryKey: ['tv', tvShowId, 'season', seasonNumber],
      queryFn: () => tmdbApi.getSeasonDetails(tvShowId, seasonNumber),
      enabled: !!userId && seasonQueries.length > 0,
      staleTime: STALE_TIME,
      retry: RETRY_COUNT,
    })),
  });

  // 6. Compute progress data from all resolved queries
  // Key insight: React Query caches data, so query.data is available even during refetch
  // We should use cached data immediately instead of waiting for isLoading to be false
  const computedData = useMemo<InProgressShow[] | null>(() => {
    // Check if we have the base tracking data (from cache or fresh)
    if (!trackingQuery.data) {
      return null;
    }

    // Check if we have at least some show details data to work with
    // During initial load, no data exists. During refetch, cached data exists.
    const hasAnyShowDetailsData = showDetailsQueries.some((q) => q.data);

    // If we're expecting show details but have none, we're still in initial load
    if (showDetailsQueries.length > 0 && !hasAnyShowDetailsData) {
      return null;
    }

    // Group season data by tvShowId
    const seasonDataByShow = new Map<number, (typeof seasonDetailsQueries)[number]['data'][]>();
    seasonQueries.forEach((sq, index) => {
      const seasonData = seasonDetailsQueries[index]?.data;
      if (seasonData) {
        const existing = seasonDataByShow.get(sq.tvShowId) || [];
        existing.push(seasonData);
        seasonDataByShow.set(sq.tvShowId, existing);
      }
    });

    const processedShows: InProgressShow[] = [];

    activeShowsWithInfo.forEach((showInfo, index) => {
      try {
        const { trackingDoc, tvShowId, furthestWatched } = showInfo;
        const episodesList = Object.values(trackingDoc.episodes).filter((episode) => episode.seasonNumber > 0);
        if (episodesList.length === 0) return;

        const metadata = trackingDoc.metadata;
        const showDetails = showDetailsQueries[index]?.data;

        if (!showDetails) return;

        const seasonsData = seasonDataByShow.get(tvShowId) || [];

        const today = new Date();

        // Use show's average episode runtime for estimates
        const avgRuntime = (showDetails.episode_run_time && showDetails.episode_run_time[0]) || 45;
        const seasonCounts = buildSeasonCounts(showDetails);
        const lastAiredEpisode = resolveLastAiredEpisode(showDetails, today);

        if (!lastAiredEpisode || seasonCounts.length === 0) {
          return;
        }

        const totalAiredEpisodes = getEpisodePosition(
          seasonCounts,
          lastAiredEpisode.seasonNumber,
          lastAiredEpisode.episodeNumber
        );

        if (totalAiredEpisodes <= 0) {
          return;
        }

        const furthestWatchedPosition = Math.min(
          getEpisodePosition(seasonCounts, furthestWatched.seasonNumber, furthestWatched.episodeNumber),
          totalAiredEpisodes
        );
        const remainingEpisodes = Math.max(0, totalAiredEpisodes - furthestWatchedPosition);
        const percentage = Math.round((furthestWatchedPosition / totalAiredEpisodes) * 100);
        const timeRemaining = remainingEpisodes > 0 ? remainingEpisodes * avgRuntime : 0;

        if (remainingEpisodes === 0 && !isShowStillActive(showDetails)) {
          return;
        }

        let nextEpisodeCandidate: {
          season: number;
          episode: number;
          title: string;
          airDate: string | null;
        } | null = null;

        if (remainingEpisodes > 0) {
          const nextEpisodeNumbers = getNextEpisodeAfter(
            seasonCounts,
            furthestWatched.seasonNumber,
            furthestWatched.episodeNumber
          );

          if (nextEpisodeNumbers) {
            const fetchedEpisode =
              seasonsData
                .flatMap((seasonData) => seasonData?.episodes || [])
                .find(
                  (episode) =>
                    episode.season_number === nextEpisodeNumbers.season &&
                    episode.episode_number === nextEpisodeNumbers.episode
                ) ?? null;

            nextEpisodeCandidate = {
              season: nextEpisodeNumbers.season,
              episode: nextEpisodeNumbers.episode,
              title: fetchedEpisode?.name || `Episode ${nextEpisodeNumbers.episode}`,
              airDate: fetchedEpisode?.air_date ?? null,
            };
          }
        }

        processedShows.push({
          tvShowId,
          tvShowName: metadata.tvShowName,
          posterPath: showDetails.poster_path ?? metadata.posterPath,
          backdropPath: showDetails.backdrop_path,
          lastUpdated: metadata.lastUpdated,
          percentage,
          timeRemaining,
          lastWatchedEpisode: {
            season: furthestWatched.seasonNumber,
            episode: furthestWatched.episodeNumber,
            title: furthestWatched.episodeName,
          },
          nextEpisode: nextEpisodeCandidate,
        });
      } catch (e) {
        console.error(`Error processing show:`, e);
      }
    });

    // Sort by lastUpdated descending
    processedShows.sort((a, b) => b.lastUpdated - a.lastUpdated);

    return processedShows;
  }, [
    trackingQuery.data,
    activeShowsWithInfo,
    showDetailsQueries,
    seasonDetailsQueries,
    seasonQueries,
  ]);

  // Use computed data, or empty array if still computing initial load
  const data = computedData ?? [];

  // Only show loading spinner on true initial load (no data at all from any source)
  // Once we have computed data, it means React Query had cached data and we're good
  const isLoading =
    computedData === null &&
    (trackingQuery.isLoading ||
      (showDetailsQueries.length > 0 && showDetailsQueries.some((q) => q.isLoading)) ||
      (seasonDetailsQueries.length > 0 && seasonDetailsQueries.some((q) => q.isLoading)));

  // Track if background refetch is happening (useful for subtle refresh indicators)
  // Only show this when we already have data to display
  const isFetching =
    computedData !== null &&
    (trackingQuery.isFetching ||
      showDetailsQueries.some((q) => q.isFetching) ||
      seasonDetailsQueries.some((q) => q.isFetching));

  // Compute error state - only error if base tracking fails or ALL show queries fail
  const allShowDetailsFailed =
    showDetailsQueries.length > 0 && showDetailsQueries.every((q) => q.error);

  const error = trackingQuery.error
    ? 'Failed to load watching progress.'
    : allShowDetailsFailed
      ? 'Failed to load show details.'
      : null;

  // Refresh function
  const refresh = async () => {
    await trackingQuery.refetch();
  };

  return {
    data,
    isLoading,
    isFetching,
    error,
    refresh,
  };
}
