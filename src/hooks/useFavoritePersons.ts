import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/auth';
import { favoritePersonsService } from '../services/FavoritePersonsService';
import { FavoritePerson } from '../types/favoritePerson';

export const useFavoritePersons = () => {
  const { user } = useAuth();
  const userId = user?.uid;

  const query = useQuery({
    queryKey: ['favoritePersons', userId],
    queryFn: () => favoritePersonsService.getFavoritePersons(userId!),
    enabled: !!userId,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
};

export const useIsPersonFavorited = (personId: number) => {
  const { data: favoritePersons, isLoading } = useFavoritePersons();

  return {
    isFavorited: favoritePersons?.some((person) => person.id === personId) ?? false,
    isLoading,
  };
};

export const useAddFavoritePerson = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: ({ personData }: { personData: Omit<FavoritePerson, 'addedAt'> }) =>
      favoritePersonsService.addFavoritePerson(personData),
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favoritePersons', userId] }),
        queryClient.invalidateQueries({
          queryKey: ['favoritePerson', userId, variables.personData.id],
        }),
      ]);
    },
  });
};

export const useRemoveFavoritePerson = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: ({ personId }: { personId: number }) =>
      favoritePersonsService.removeFavoritePerson(personId),
    onSuccess: async (_data, variables) => {
      if (!userId) return;

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['favoritePersons', userId] }),
        queryClient.invalidateQueries({ queryKey: ['favoritePerson', userId, variables.personId] }),
      ]);
    },
  });
};
