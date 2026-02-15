import { MAX_FREE_ITEMS_PER_LIST } from '@/src/constants/lists';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { Episode, Season } from '../api/tmdb';
import { auth } from '../firebase/config';
import { episodeTrackingService } from '../services/EpisodeTrackingService';
import type { TVShowEpisodeTracking } from '../types/episodeTracking';

const getUserId = () => auth.currentUser?.uid;
const getShowEpisodeTrackingQueryKey = (userId: string | undefined, tvShowId: number) =>
  ['episodeTracking', userId, tvShowId] as const;

const invalidateEpisodeTrackingQueries = (
  queryClient: ReturnType<typeof useQueryClient>,
  userId: string,
  tvShowId: number
) =>
  Promise.all([
    queryClient.invalidateQueries({
      queryKey: getShowEpisodeTrackingQueryKey(userId, tvShowId),
    }),
    queryClient.invalidateQueries({ queryKey: ['episodeTracking', 'allShows', userId] }),
  ]);

const invalidateListQueries = (queryClient: ReturnType<typeof useQueryClient>, userId: string) =>
  Promise.all([
    queryClient.invalidateQueries({ queryKey: ['lists', userId] }),
    queryClient.invalidateQueries({
      queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
      refetchType: 'active',
    }),
  ]);

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
  /**
   * Optional auto-add configuration for adding show to Watching list
   */
  autoAddOptions?: {
    /** TV show status from TMDB (e.g., 'Returning Series', 'Ended', 'Canceled') */
    showStatus?: string;
    /** Whether auto-add is enabled (from user preferences) */
    shouldAutoAdd?: boolean;
    /** Cached list membership - map of listId to boolean */
    listMembership?: Record<string, boolean>;
    /** First air date for show metadata */
    firstAirDate?: string;
    /** Vote average for show metadata */
    voteAverage?: number;
    /** Genre IDs for show metadata */
    genreIds?: number[];
    /** Whether the user is a premium subscriber */
    isPremium?: boolean;
    /** Current number of items in the target list (for limit checking) */
    currentListCount?: number;
  };
  /**
   * Optional configuration for marking previous episodes as watched
   */
  previousEpisodesOptions?: {
    /** All episodes in the current season (from TMDB) */
    seasonEpisodes: Episode[];
    /** Whether the preference is enabled */
    shouldMarkPrevious: boolean;
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
 * Fetch episode tracking data for a specific TV show.
 */
export const useShowEpisodeTracking = (tvShowId: number) => {
  const userId = auth.currentUser?.uid;
  const query = useQuery<TVShowEpisodeTracking | null>({
    queryKey: getShowEpisodeTrackingQueryKey(userId, tvShowId),
    queryFn: () => episodeTrackingService.getShowTracking(tvShowId),
    enabled: !!userId && tvShowId > 0,
  });

  return {
    ...query,
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
 * Includes auto-add to Watching list when preference is enabled
 */
export const useMarkEpisodeWatched = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MarkEpisodeWatchedParams) => {
      // First, mark the episode as watched (primary action)
      await episodeTrackingService.markEpisodeWatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodeNumber,
        params.episodeData,
        params.showMetadata
      );

      // Then, handle auto-add to Watching list (non-blocking)
      // Default shouldAutoAdd to true when undefined (for new users without preferences field)
      const { autoAddOptions } = params;
      const shouldAutoAdd = autoAddOptions?.shouldAutoAdd ?? true;
      if (
        shouldAutoAdd &&
        autoAddOptions?.listMembership &&
        !autoAddOptions.listMembership['currently-watching']
      ) {
        // Check list limit for free users before auto-adding
        const isPremium = autoAddOptions.isPremium ?? false;
        const currentCount = autoAddOptions.currentListCount ?? 0;
        if (!isPremium && currentCount >= MAX_FREE_ITEMS_PER_LIST) {
          console.log(
            '[useMarkEpisodeWatched] Skipping auto-add: list limit reached for free user'
          );
        } else {
          try {
            // Dynamically import to avoid circular dependencies
            const { listService } = await import('../services/ListService');

            await listService.addToList(
              'currently-watching',
              {
                id: params.tvShowId,
                title: params.showMetadata.tvShowName,
                name: params.showMetadata.tvShowName,
                poster_path: params.showMetadata.posterPath,
                media_type: 'tv',
                vote_average: autoAddOptions.voteAverage ?? 0,
                release_date: autoAddOptions.firstAirDate ?? '',
                first_air_date: autoAddOptions.firstAirDate,
                genre_ids: autoAddOptions.genreIds,
              },
              'Watching'
            );

            console.log(
              '[useMarkEpisodeWatched] Auto-added to Watching list:',
              params.showMetadata.tvShowName
            );
          } catch (autoAddError) {
            // Log but don't throw - auto-add is non-critical
            console.error(
              '[useMarkEpisodeWatched] Auto-add to Watching list failed:',
              autoAddError
            );
          }
        }
      }

      // Handle marking previous episodes as watched (non-blocking)
      const { previousEpisodesOptions } = params;
      if (
        previousEpisodesOptions?.shouldMarkPrevious &&
        previousEpisodesOptions.seasonEpisodes.length > 0 &&
        params.episodeNumber > 1
      ) {
        try {
          const previousEpisodes = previousEpisodesOptions.seasonEpisodes.filter(
            (ep) => ep.episode_number < params.episodeNumber
          );

          if (previousEpisodes.length > 0) {
            await episodeTrackingService.markAllEpisodesWatched(
              params.tvShowId,
              params.seasonNumber,
              previousEpisodes,
              params.showMetadata
            );

            console.log(
              '[useMarkEpisodeWatched] Auto-marked previous episodes:',
              previousEpisodes.length
            );
          }
        } catch (prevEpisodesError) {
          // Log but don't throw - marking previous episodes is non-critical
          console.error(
            '[useMarkEpisodeWatched] Mark previous episodes failed:',
            prevEpisodesError
          );
        }
      }
    },
    onSuccess: async (_result, params) => {
      const userId = getUserId();
      if (userId) {
        await Promise.all([
          invalidateEpisodeTrackingQueries(queryClient, userId, params.tvShowId),
          invalidateListQueries(queryClient, userId),
        ]);
      }
    },
  });
};

/**
 * Mutation hook for marking an episode as unwatched
 */
export const useMarkEpisodeUnwatched = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: MarkEpisodeUnwatchedParams) =>
      episodeTrackingService.markEpisodeUnwatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodeNumber
      ),
    onSuccess: async (_result, params) => {
      const userId = getUserId();
      if (userId) {
        await Promise.all([
          invalidateEpisodeTrackingQueries(queryClient, userId, params.tvShowId),
          invalidateListQueries(queryClient, userId),
        ]);
      }
    },
  });
};

/**
 * Mutation hook for marking all episodes in a season as watched
 */
export const useMarkAllEpisodesWatched = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: MarkAllEpisodesWatchedParams) =>
      episodeTrackingService.markAllEpisodesWatched(
        params.tvShowId,
        params.seasonNumber,
        params.episodes,
        params.showMetadata
      ),
    onSuccess: async (_result, params) => {
      const userId = getUserId();
      if (userId) {
        await Promise.all([
          invalidateEpisodeTrackingQueries(queryClient, userId, params.tvShowId),
          invalidateListQueries(queryClient, userId),
        ]);
      }
    },
  });
};
