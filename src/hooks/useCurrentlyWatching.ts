import { tmdbApi } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';
import { InProgressShow, WatchedEpisode } from '@/src/types/episodeTracking';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const RETRY_COUNT = 2;

/**
 * Hook to fetch and compute currently watching shows with proper React Query caching.
 * Uses useQuery for Firestore data and useQueries for TMDB API calls.
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

  // 2. Filter to shows with watched episodes
  const activeShows = useMemo(() => {
    if (!trackingQuery.data) return [];
    return trackingQuery.data.filter((show) => Object.keys(show.episodes).length > 0);
  }, [trackingQuery.data]);

  // 3. Extract tvShowIds from tracking data
  const tvShowIds = useMemo(() => {
    return activeShows
      .map((show) => {
        const episodes = Object.values(show.episodes);
        return episodes.length > 0 ? episodes[0].tvShowId : null;
      })
      .filter((id): id is number => id !== null);
  }, [activeShows]);

  // 4. Fetch TV show details for each active show
  const showDetailsQueries = useQueries({
    queries: tvShowIds.map((tvShowId) => ({
      queryKey: ['tv', tvShowId],
      queryFn: () => tmdbApi.getTVShowDetails(tvShowId),
      enabled: !!user && tvShowIds.length > 0,
      staleTime: STALE_TIME,
      retry: RETRY_COUNT,
    })),
  });

  // 5. Build season queries after show details are loaded
  const seasonQueries = useMemo(() => {
    const queries: { tvShowId: number; seasonNumber: number }[] = [];

    showDetailsQueries.forEach((query, index) => {
      if (query.data) {
        const tvShowId = tvShowIds[index];
        const airedSeasons = query.data.seasons.filter(
          (s) => s.season_number > 0 && s.air_date && new Date(s.air_date) <= new Date()
        );
        airedSeasons.forEach((season) => {
          queries.push({ tvShowId, seasonNumber: season.season_number });
        });
      }
    });

    return queries;
  }, [showDetailsQueries, tvShowIds]);

  // 6. Fetch season details for all aired seasons
  const seasonDetailsQueries = useQueries({
    queries: seasonQueries.map(({ tvShowId, seasonNumber }) => ({
      queryKey: ['tv', tvShowId, 'season', seasonNumber],
      queryFn: () => tmdbApi.getSeasonDetails(tvShowId, seasonNumber),
      enabled: !!user && seasonQueries.length > 0,
      staleTime: STALE_TIME,
      retry: RETRY_COUNT,
    })),
  });

  // 7. Compute progress data from all resolved queries
  const data = useMemo<InProgressShow[]>(() => {
    // Wait for all queries to settle
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

    activeShows.forEach((trackingDoc, index) => {
      try {
        const episodesList = Object.values(trackingDoc.episodes);
        if (episodesList.length === 0) return;

        const tvShowId = episodesList[0].tvShowId;
        const metadata = trackingDoc.metadata;
        const showDetails = showDetailsQueries[index]?.data;

        if (!showDetails) return;

        const seasonsData = seasonDataByShow.get(tvShowId) || [];
        if (seasonsData.length === 0) return;

        let totalRuntimeMinutes = 0;
        let totalAvailableEpisodes = 0;
        let totalWatchedCount = 0;
        let nextEpisodeCandidate: {
          season: number;
          episode: number;
          title: string;
          airDate: string | null;
        } | null = null;

        // Flatten episodes from all seasons
        const allEpisodes = seasonsData.flatMap((s) => s?.episodes || []);

        // Sort episodes by season/number
        allEpisodes.sort((a, b) => {
          if (a.season_number !== b.season_number) return a.season_number - b.season_number;
          return a.episode_number - b.episode_number;
        });

        // Determine last watched
        const sortedWatched = [...episodesList].sort((a, b) => {
          if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
          return a.episodeNumber - b.episodeNumber;
        });
        const lastWatched = sortedWatched[sortedWatched.length - 1];

        // Calculate progress and find next episode
        for (const ep of allEpisodes) {
          const isWatched = isEpisodeWatched(
            ep.season_number,
            ep.episode_number,
            trackingDoc.episodes
          );
          const isReleased = ep.air_date && new Date(ep.air_date) <= new Date();

          if (isReleased) {
            totalAvailableEpisodes++;

            if (isWatched) {
              totalWatchedCount++;
            } else {
              const runtime =
                ep.runtime ||
                (showDetails.episode_run_time && showDetails.episode_run_time[0]) ||
                45;
              totalRuntimeMinutes += runtime;

              // Find next episode after last watched
              if (!nextEpisodeCandidate) {
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
                }
              }
            }
          }
        }

        // Skip completed shows
        if (totalWatchedCount >= totalAvailableEpisodes) {
          return;
        }

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
          timeRemaining: totalRuntimeMinutes,
          lastWatchedEpisode: {
            season: lastWatched.seasonNumber,
            episode: lastWatched.episodeNumber,
            title: lastWatched.episodeName,
          },
          nextEpisode: nextEpisodeCandidate,
        });
      } catch (e) {
        console.error(`Error processing show ${trackingDoc.metadata.tvShowName}:`, e);
      }
    });

    // Sort by lastUpdated descending
    processedShows.sort((a, b) => b.lastUpdated - a.lastUpdated);

    return processedShows;
  }, [trackingQuery.data, activeShows, showDetailsQueries, seasonDetailsQueries, seasonQueries]);

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

  // Refresh function that invalidates all related queries
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
