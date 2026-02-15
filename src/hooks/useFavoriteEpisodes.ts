import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { favoriteEpisodeService } from '@/src/services/FavoriteEpisodeService';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export const useFavoriteEpisodes = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;
  const previousUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && !userId) {
      queryClient.removeQueries({ queryKey: ['favoriteEpisodes', previousUserId] });
    }
    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['favoriteEpisodes', userId],
    queryFn: () => favoriteEpisodeService.getFavoriteEpisodes(userId!),
    enabled: !!userId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
};

/**
 * Hook to check if a specific episode is favorited.
 */
export const useIsEpisodeFavorited = (
  tvId: number,
  seasonNumber: number,
  episodeNumber: number
) => {
  const { data: favoriteEpisodes, isLoading } = useFavoriteEpisodes();
  const episodeId = `${tvId}-${seasonNumber}-${episodeNumber}`;

  return {
    isFavorited: favoriteEpisodes?.some((episode) => episode.id === episodeId) ?? false,
    isLoading,
  };
};

/**
 * Mutation hook to toggle favorite status for an episode.
 */
export const useToggleFavoriteEpisode = () => {
  const { user } = useAuth();
  const userId = user?.uid;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      isFavorited,
      episodeData,
    }: {
      isFavorited: boolean;
      episodeData: Omit<FavoriteEpisode, 'addedAt'>;
    }) => {
      if (!userId) throw new Error('Please sign in to continue');

      if (isFavorited) {
        await favoriteEpisodeService.removeFavoriteEpisode(userId, episodeData.id);
      } else {
        await favoriteEpisodeService.addFavoriteEpisode(userId, episodeData);
      }
    },
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favoriteEpisodes', userId] }),
        queryClient.invalidateQueries({
          queryKey: ['favoriteEpisode', userId, variables.episodeData.id],
        }),
      ]);
    },
  });
};
