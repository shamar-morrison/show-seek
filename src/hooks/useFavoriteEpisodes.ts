import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context/auth';
import { favoriteEpisodeService } from '../services/FavoriteEpisodeService';
import { useRealtimeSubscription } from './useRealtimeSubscription';

/**
 * Hook to manage all favorite episodes for the current user.
 */
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

  const subscribe = useCallback(
    (onData: (data: FavoriteEpisode[]) => void, onError: (error: Error) => void) => {
      if (!userId) return () => {};
      return favoriteEpisodeService.subscribeToFavoriteEpisodes(userId, onData, onError);
    },
    [userId]
  );

  const query = useRealtimeSubscription<FavoriteEpisode[]>({
    queryKey: ['favoriteEpisodes', userId],
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useFavoriteEpisodes',
  });

  return {
    ...query,
  };
};

/**
 * Hook to check if a specific episode is favorited.
 */
export const useIsEpisodeFavorited = (tvId: number, seasonNumber: number, episodeNumber: number) => {
  const { data: favoriteEpisodes, isLoading } = useFavoriteEpisodes();
  const episodeId = `${tvId}-${seasonNumber}-${episodeNumber}`;
  
  const isFavorited = favoriteEpisodes?.some((ep) => ep.id === episodeId) ?? false;

  return {
    isFavorited,
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
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['favoriteEpisodes', userId] });
      }
    },
  });
};
