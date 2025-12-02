import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase/config';
import { episodeTrackingService } from '../services/EpisodeTrackingService';
import type { Episode, Season } from '../api/tmdb';
import type {
  SeasonProgress,
  ShowProgress,
  TVShowEpisodeTracking,
} from '../types/episodeTracking';

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
    return episodeTrackingService.isEpisodeWatched(
      seasonNumber,
      episodeNumber,
      tracking.episodes
    );
  }, [tracking, seasonNumber, episodeNumber]);

  return { isWatched, isLoading };
};

/**
 * Calculate progress for a specific season
 */
export const useSeasonProgress = (
  tvShowId: number,
  seasonNumber: number,
  episodes: Episode[]
) => {
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
    return episodeTrackingService.calculateShowProgress(
      seasons,
      allEpisodes,
      tracking.episodes
    );
  }, [tracking, seasons, allEpisodes]);

  return { progress, isLoading };
};

/**
 * Mutation hook for marking an episode as watched
 */
export const useMarkEpisodeWatched = () => {
  return useMutation({
    mutationFn: ({
      tvShowId,
      seasonNumber,
      episodeNumber,
      episodeData,
      showMetadata,
    }: {
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
    }) =>
      episodeTrackingService.markEpisodeWatched(
        tvShowId,
        seasonNumber,
        episodeNumber,
        episodeData,
        showMetadata
      ),
  });
};

/**
 * Mutation hook for marking an episode as unwatched
 */
export const useMarkEpisodeUnwatched = () => {
  return useMutation({
    mutationFn: ({
      tvShowId,
      seasonNumber,
      episodeNumber,
    }: {
      tvShowId: number;
      seasonNumber: number;
      episodeNumber: number;
    }) => episodeTrackingService.markEpisodeUnwatched(tvShowId, seasonNumber, episodeNumber),
  });
};
