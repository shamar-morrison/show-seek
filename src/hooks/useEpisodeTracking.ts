import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import type { Episode, Season } from '../api/tmdb';
import { auth } from '../firebase/config';
import { episodeTrackingService } from '../services/EpisodeTrackingService';
import type { TVShowEpisodeTracking } from '../types/episodeTracking';

/**
 * Parameters for marking an episode as watched
 */
export interface MarkEpisodeWatchedParams {
  tvShowId: number;
  seasonNumber: number;
  episodeNumber: number;
  episodeData: {
    episodeId: number;
    episodeName: string;
    episodeAirDate: string | null;
  };
  showMetadata: {
    tvShowName: string;
    posterPath: string | null;
  };
}

/**
 * Parameters for marking an episode as unwatched
 */
export interface MarkEpisodeUnwatchedParams {
  tvShowId: number;
  seasonNumber: number;
  episodeNumber: number;
}

/**
 * Parameters for marking all episodes in a season as watched
 */
export interface MarkAllEpisodesWatchedParams {
  tvShowId: number;
  seasonNumber: number;
  episodes: Episode[];
  showMetadata: {
    tvShowName: string;
    posterPath: string | null;
  };
}

/**
 * Subscribe to episode tracking data for a specific TV show
 */
export const useShowEpisodeTracking = (tvShowId: number) => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    setIsSubscriptionLoading(true);

    const unsubscribe = episodeTrackingService.subscribeToShowTracking(
      tvShowId,
      (tracking) => {
        queryClient.setQueryData(['episodeTracking', userId, tvShowId], tracking);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useShowEpisodeTracking] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, tvShowId, queryClient]);

  const query = useQuery({
    queryKey: ['episodeTracking', userId, tvShowId],
    queryFn: () => {
      // Initial data is handled by subscription
      return (
        queryClient.getQueryData<TVShowEpisodeTracking | null>([
          'episodeTracking',
          userId,
          tvShowId,
        ]) || null
      );
    },
    enabled: !!userId,
    staleTime: Infinity, // Data is updated via subscription
    meta: { error },
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
  };
};

/**
 * Check if a specific episode is watched
 */
export const useIsEpisodeWatched = (
  tvShowId: number,
  seasonNumber: number,
  episodeNumber: number
) => {
  const { data: tracking, isLoading } = useShowEpisodeTracking(tvShowId);

  const isWatched = useMemo(() => {
    if (!tracking?.episodes) return false;
    return episodeTrackingService.isEpisodeWatched(seasonNumber, episodeNumber, tracking.episodes);
  }, [tracking, seasonNumber, episodeNumber]);

  return { isWatched, isLoading };
};

/**
 * Calculate progress for a specific season
 */
export const useSeasonProgress = (tvShowId: number, seasonNumber: number, episodes: Episode[]) => {
  const { data: tracking, isLoading } = useShowEpisodeTracking(tvShowId);

  const progress = useMemo(() => {
    if (!tracking?.episodes || !episodes.length) return null;
    return episodeTrackingService.calculateSeasonProgress(
      seasonNumber,
      episodes,
      tracking.episodes
    );
  }, [tracking, seasonNumber, episodes]);

  return { progress, isLoading };
};

/**
 * Calculate overall show progress across all seasons
 */
export const useShowProgress = (tvShowId: number, seasons: Season[], allEpisodes: Episode[]) => {
  const { data: tracking, isLoading } = useShowEpisodeTracking(tvShowId);

  const progress = useMemo(() => {
    if (!tracking?.episodes || !allEpisodes.length) return null;
    return episodeTrackingService.calculateShowProgress(seasons, allEpisodes, tracking.episodes);
  }, [tracking, seasons, allEpisodes]);

  return { progress, isLoading };
};

/**
 * Mutation hook for marking an episode as watched
 */
export const useMarkEpisodeWatched = () => {
  return useMutation({
    mutationFn: (params: MarkEpisodeWatchedParams) =>
      episodeTrackingService.markEpisodeWatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodeNumber,
        params.episodeData,
        params.showMetadata
      ),
  });
};

/**
 * Mutation hook for marking an episode as unwatched
 */
export const useMarkEpisodeUnwatched = () => {
  return useMutation({
    mutationFn: (params: MarkEpisodeUnwatchedParams) =>
      episodeTrackingService.markEpisodeUnwatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodeNumber
      ),
  });
};

/**
 * Mutation hook for marking all episodes in a season as watched
 */
export const useMarkAllEpisodesWatched = () => {
  return useMutation({
    mutationFn: (params: MarkAllEpisodesWatchedParams) =>
      episodeTrackingService.markAllEpisodesWatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodes,
        params.showMetadata
      ),
  });
};
