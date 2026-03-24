import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { favoriteEpisodeService } from '@/src/services/FavoriteEpisodeService';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

const getFavoriteEpisodesQueryKey = (userId?: string) => ['favoriteEpisodes', userId] as const;
const getFavoriteEpisodeQueryKey = (userId: string | undefined, episodeId: string) =>
  ['favoriteEpisode', userId, episodeId] as const;

export const useFavoriteEpisodes = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const previousUserIdRef = useRef<string | undefined>(userId);

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && !userId) {
      queryClient.removeQueries({ queryKey: getFavoriteEpisodesQueryKey(previousUserId) });
    }
    previousUserIdRef.current = userId;
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: getFavoriteEpisodesQueryKey(userId),
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
  const userId = user && !user.isAnonymous ? user.uid : undefined;
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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const listQueryKey = getFavoriteEpisodesQueryKey(userId);
      const detailQueryKey = getFavoriteEpisodeQueryKey(userId, variables.episodeData.id);

      await Promise.all([
        queryClient.cancelQueries({ queryKey: listQueryKey }),
        queryClient.cancelQueries({ queryKey: detailQueryKey }),
      ]);

      const previousFavorites = queryClient.getQueryData<FavoriteEpisode[]>(listQueryKey);
      const previousFavoriteEpisode = queryClient.getQueryData<FavoriteEpisode | null>(
        detailQueryKey
      );

      const optimisticFavorite: FavoriteEpisode = {
        ...variables.episodeData,
        addedAt:
          previousFavorites?.find((episode) => episode.id === variables.episodeData.id)?.addedAt ??
          previousFavoriteEpisode?.addedAt ??
          Date.now(),
      };

      queryClient.setQueryData<FavoriteEpisode[]>(listQueryKey, (current) => {
        if (variables.isFavorited) {
          return (current ?? []).filter((episode) => episode.id !== variables.episodeData.id);
        }

        const withoutExisting = (current ?? []).filter(
          (episode) => episode.id !== optimisticFavorite.id
        );
        return [optimisticFavorite, ...withoutExisting];
      });

      queryClient.setQueryData<FavoriteEpisode | null>(
        detailQueryKey,
        variables.isFavorited ? null : optimisticFavorite
      );

      return {
        listQueryKey,
        detailQueryKey,
        previousFavorites,
        previousFavoriteEpisode,
      };
    },
    onError: (_error, _variables, context) => {
      if (!context) return;

      queryClient.setQueryData(context.listQueryKey, context.previousFavorites ?? []);
      queryClient.setQueryData(context.detailQueryKey, context.previousFavoriteEpisode ?? null);
    },
    onSettled: async (_data, _error, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getFavoriteEpisodesQueryKey(userId) }),
        queryClient.invalidateQueries({
          queryKey: getFavoriteEpisodeQueryKey(userId, variables.episodeData.id),
        }),
      ]);
    },
  });
};
