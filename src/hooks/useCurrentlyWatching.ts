import { tmdbApi } from '@/src/api/tmdb';
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

  // 1. Fetch all tracking docs from Firestore
  const trackingQuery = useQuery({
    queryKey: ['episodeTracking', 'allShows', user?.uid],
    queryFn: () => episodeTrackingService.getAllWatchedShows(user!.uid),
    enabled: !!user,
    staleTime: STALE_TIME,
    retry: RETRY_COUNT,
  });

  // 2. Filter to shows with watched episodes and extract metadata
  const activeShowsWithInfo = useMemo(() => {
    if (!trackingQuery.data) return [];

    return trackingQuery.data
      .filter((show) => Object.keys(show.episodes).length > 0)
      .map((show) => {
        const episodes = Object.values(show.episodes);
        if (episodes.length === 0) return null;

        // Find the highest season number the user has watched
        let maxWatchedSeason = 0;
        for (const ep of episodes) {
          if (ep.seasonNumber > maxWatchedSeason) {
            maxWatchedSeason = ep.seasonNumber;
          }
        }

        return {
          trackingDoc: show,
          tvShowId: episodes[0].tvShowId,
          maxWatchedSeason,
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
      enabled: !!user && tvShowIds.length > 0,
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
      enabled: !!user && seasonQueries.length > 0,
      staleTime: STALE_TIME,
      retry: RETRY_COUNT,
    })),
  });

  // 6. Compute progress data from all resolved queries
  const data = useMemo<InProgressShow[]>(() => {
    const allShowDetailsLoaded = showDetailsQueries.every((q) => !q.isLoading);
    const allSeasonDetailsLoaded = seasonDetailsQueries.every((q) => !q.isLoading);

    if (!trackingQuery.data || !allShowDetailsLoaded || !allSeasonDetailsLoaded) {
      return [];
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
        const { trackingDoc, tvShowId, maxWatchedSeason } = showInfo;
        const episodesList = Object.values(trackingDoc.episodes);
        if (episodesList.length === 0) return;

        const metadata = trackingDoc.metadata;
        const showDetails = showDetailsQueries[index]?.data;

        if (!showDetails) return;

        const seasonsData = seasonDataByShow.get(tvShowId) || [];

        // Use show's average episode runtime for estimates
        const avgRuntime = (showDetails.episode_run_time && showDetails.episode_run_time[0]) || 45;

        // Calculate total available/watched from showDetails season info (rough estimate)
        const airedSeasons = showDetails.seasons.filter(
          (s) => s.season_number > 0 && s.air_date && new Date(s.air_date) <= new Date()
        );

        // Estimate total available episodes from season episode_count
        const totalAvailableEpisodes = airedSeasons.reduce(
          (sum, s) => sum + (s.episode_count || 0),
          0
        );

        // Count watched episodes
        const totalWatchedCount = episodesList.filter((ep) => ep.seasonNumber > 0).length;

        // Check if likely completed (rough estimate)
        if (totalWatchedCount >= totalAvailableEpisodes && totalAvailableEpisodes > 0) {
          return; // Skip completed shows
        }

        // Find next episode from fetched season details
        let nextEpisodeCandidate: {
          season: number;
          episode: number;
          title: string;
          airDate: string | null;
        } | null = null;

        // Get last watched episode
        const sortedWatched = [...episodesList].sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
          return a.episodeNumber - b.episodeNumber;
        });
        const lastWatched = sortedWatched[sortedWatched.length - 1];

        // Search for next unwatched episode in fetched seasons
        if (seasonsData.length > 0) {
          const allFetchedEpisodes = seasonsData.flatMap((s) => s?.episodes || []);
          allFetchedEpisodes.sort((a, b) => {
            if (a.season_number !== b.season_number) return a.season_number - b.season_number;
            return a.episode_number - b.episode_number;
          });

          for (const ep of allFetchedEpisodes) {
            const isWatched = isEpisodeWatched(
              ep.season_number,
              ep.episode_number,
              trackingDoc.episodes
            );
            const isReleased = ep.air_date && new Date(ep.air_date) <= new Date();

            if (isReleased && !isWatched) {
              const isAfterLast =
                ep.season_number > lastWatched.seasonNumber ||
                (ep.season_number === lastWatched.seasonNumber &&
                  ep.episode_number > lastWatched.episodeNumber);

              if (isAfterLast) {
                nextEpisodeCandidate = {
                  season: ep.season_number,
                  episode: ep.episode_number,
                  title: ep.name,
                  airDate: ep.air_date,
                };
                break;
              }
            }
          }
        }

        // Estimate time remaining using average runtime
        const unwatchedCount = Math.max(0, totalAvailableEpisodes - totalWatchedCount);
        const timeRemaining = unwatchedCount * avgRuntime;

        const percentage =
          totalAvailableEpisodes > 0
            ? Math.round((totalWatchedCount / totalAvailableEpisodes) * 100)
            : 0;

        processedShows.push({
          tvShowId,
          tvShowName: metadata.tvShowName,
          posterPath: metadata.posterPath,
          backdropPath: showDetails.backdrop_path,
          lastUpdated: metadata.lastUpdated,
          percentage,
          timeRemaining,
          lastWatchedEpisode: {
            season: lastWatched.seasonNumber,
            episode: lastWatched.episodeNumber,
            title: lastWatched.episodeName,
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

  // Compute loading state
  const isLoading =
    trackingQuery.isLoading ||
    showDetailsQueries.some((q) => q.isLoading) ||
    seasonDetailsQueries.some((q) => q.isLoading);

  // Compute error state
  const error = trackingQuery.error
    ? 'Failed to load watching progress.'
    : showDetailsQueries.some((q) => q.error) || seasonDetailsQueries.some((q) => q.error)
      ? 'Failed to load show details.'
      : null;

  // Refresh function
  const refresh = async () => {
    await trackingQuery.refetch();
  };

  return {
    data,
    isLoading,
    error,
    refresh,
  };
}

/**
 * Helper to check if an episode is watched
 */
function isEpisodeWatched(
  seasonNumber: number,
  episodeNumber: number,
  watchedEpisodes: Record<string, WatchedEpisode>
): boolean {
  const episodeKey = `${seasonNumber}_${episodeNumber}`;
  return episodeKey in watchedEpisodes;
}
