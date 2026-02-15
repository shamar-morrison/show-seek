import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../context/auth';
import { favoritePersonsService } from '../services/FavoritePersonsService';
import { FavoritePerson } from '../types/favoritePerson';

const getFavoritePersonsQueryKey = (userId?: string) => ['favoritePersons', userId] as const;

export const useFavoritePersons = () => {
  const { user } = useAuth();
  const userId = user?.uid;

  const query = useQuery({
    queryKey: getFavoritePersonsQueryKey(userId),
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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const queryKey = getFavoritePersonsQueryKey(userId);
      await queryClient.cancelQueries({ queryKey });
      const previousFavorites = queryClient.getQueryData<FavoritePerson[]>(queryKey);
      const optimisticFavorite: FavoritePerson = {
        ...variables.personData,
        addedAt: Date.now(),
      };

      queryClient.setQueryData<FavoritePerson[]>(queryKey, (current) => {
        if (!current) {
          return [optimisticFavorite];
        }

        const withoutExisting = current.filter((person) => person.id !== optimisticFavorite.id);
        return [...withoutExisting, optimisticFavorite];
      });

      return { previousFavorites };
    },
    onError: (_error, _variables, context) => {
      if (!userId) return;

      queryClient.setQueryData(
        getFavoritePersonsQueryKey(userId),
        context?.previousFavorites ?? []
      );
    },
    onSettled: async () => {
      if (!userId) return;
      await queryClient.invalidateQueries({ queryKey: getFavoritePersonsQueryKey(userId) });
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
    onMutate: async (variables) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const queryKey = getFavoritePersonsQueryKey(userId);
      await queryClient.cancelQueries({ queryKey });
      const previousFavorites = queryClient.getQueryData<FavoritePerson[]>(queryKey);

      queryClient.setQueryData<FavoritePerson[]>(queryKey, (current) => {
        if (!current) {
          return [];
        }

        return current.filter((person) => person.id !== variables.personId);
      });

      return { previousFavorites };
    },
    onError: (_error, _variables, context) => {
      if (!userId) return;

      queryClient.setQueryData(
        getFavoritePersonsQueryKey(userId),
        context?.previousFavorites ?? []
      );
    },
    onSettled: async () => {
      if (!userId) return;
      await queryClient.invalidateQueries({ queryKey: getFavoritePersonsQueryKey(userId) });
    },
  });
};
