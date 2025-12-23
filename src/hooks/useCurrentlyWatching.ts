import { tmdbApi } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';
import { InProgressShow, TVShowEpisodeTracking } from '@/src/types/episodeTracking';
import { useCallback, useEffect, useState } from 'react';

export function useCurrentlyWatching() {
  const { user } = useAuth();
  const [data, setData] = useState<InProgressShow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchingData = useCallback(async () => {
    if (!user) {
      setData([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      // 1. Fetch all tracking docs
      const allTracking = await episodeTrackingService.getAllWatchedShows(user.uid);

      // 2. Filter for potential in-progress shows and map to initial structure
      // We do a rough filter first: has episodes watched
      const activeShows: TVShowEpisodeTracking[] = [];

      for (const show of allTracking) {
        if (Object.keys(show.episodes).length > 0) {
          activeShows.push(show);
        }
      }

      // 3. Process each show to get details and calculate progress
      const processedShows = await Promise.all(
        activeShows.map(async (trackingDoc) => {
          try {
            const episodesList = Object.values(trackingDoc.episodes);
            if (episodesList.length === 0) return null;

            const tvShowId = episodesList[0].tvShowId;
            const metadata = trackingDoc.metadata;

            // Fetch Show Details from TMDB
            // We need full details to know total episodes/seasons
            const showDetails = await tmdbApi.getTVShowDetails(tvShowId);

            const seasons = showDetails.seasons;
            const seasonPromises = seasons
              .filter(
                (s) => s.season_number > 0 && s.air_date && new Date(s.air_date) <= new Date()
              )
              .map((s) => tmdbApi.getSeasonDetails(tvShowId, s.season_number));

            const seasonsDetails = await Promise.all(seasonPromises);

            let totalRuntimeMinutes = 0;
            let totalAvailableEpisodes = 0;
            let totalWatchedCount = 0;
            let nextEpisodeCandidate: {
              season: number;
              episode: number;
              title: string;
              airDate: string | null;
            } | null = null;

            // Flatten episodes
            const allEpisodes = seasonsDetails.flatMap((s) => s.episodes || []);

            // Sort episodes by season/number
            allEpisodes.sort((a, b) => {
              if (a.season_number !== b.season_number) return a.season_number - b.season_number;
              return a.episode_number - b.episode_number;
            });

            // Determine last watched
            const sortedWatched = episodesList.sort((a, b) => {
              if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
              return a.episodeNumber - b.episodeNumber;
            });
            const lastWatched = sortedWatched[sortedWatched.length - 1];

            // Iterate to calculate time remaining and find next episode
            for (const ep of allEpisodes) {
              const isWatched = episodeTrackingService.isEpisodeWatched(
                ep.season_number,
                ep.episode_number,
                trackingDoc.episodes
              );

              // Count available
              const isReleased = ep.air_date && new Date(ep.air_date) <= new Date();
              if (isReleased) {
                totalAvailableEpisodes++;

                if (isWatched) {
                  totalWatchedCount++;
                } else {
                  // Unwatched
                  const runtime =
                    ep.runtime ||
                    (showDetails.episode_run_time && showDetails.episode_run_time[0]) ||
                    45;
                  totalRuntimeMinutes += runtime;

                  // Check if this is a candidate for next episode
                  // Must be AFTER last watched
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

            // Check if completed
            if (totalWatchedCount >= totalAvailableEpisodes) {
              // It's completed effectively
              return null;
            }

            const percentage =
              totalAvailableEpisodes > 0
                ? Math.round((totalWatchedCount / totalAvailableEpisodes) * 100)
                : 0;

            return {
              tvShowId: tvShowId,
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
            } as InProgressShow;
          } catch (e) {
            console.error(`Error processing show ${trackingDoc.metadata.tvShowName}:`, e);
            return null;
          }
        })
      );

      // Filter out nulls (errors or completed shows) and sort
      const validShows = processedShows.filter((s): s is InProgressShow => s !== null);

      validShows.sort((a, b) => b.lastUpdated - a.lastUpdated);

      setData(validShows);
    } catch (err) {
      console.error('Error in useCurrentlyWatching:', err);
      setError('Failed to load watching progress.');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchWatchingData();
  }, [fetchWatchingData]);

  return {
    data,
    isLoading,
    error,
    refresh: fetchWatchingData,
  };
}
