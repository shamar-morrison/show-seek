import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { favoritePersonsService } from '../services/FavoritePersonsService';
import { FavoritePerson } from '../types/favoritePerson';

export const useFavoritePersons = () => {
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

    const unsubscribe = favoritePersonsService.subscribeToFavoritePersons(
      (persons) => {
        queryClient.setQueryData(['favoritePersons', userId], persons);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useFavoritePersons] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['favoritePersons', userId],
    queryFn: () => {
      return queryClient.getQueryData<FavoritePerson[]>(['favoritePersons', userId]) || [];
    },
    enabled: !!userId,
    staleTime: Infinity,
    meta: { error },
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
  };
};

export const useIsPersonFavorited = (personId: number) => {
  const { data: favoritePersons, isLoading } = useFavoritePersons();

  if (!favoritePersons) {
    return { isFavorited: false, isLoading: true };
  }

  const isFavorited = favoritePersons.some((person) => person.id === personId);

  return {
    isFavorited,
    isLoading: isLoading || false,
  };
};

export const useAddFavoritePerson = () => {
  return useMutation({
    mutationFn: ({ personData }: { personData: Omit<FavoritePerson, 'addedAt'> }) =>
      favoritePersonsService.addFavoritePerson(personData),
  });
};

export const useRemoveFavoritePerson = () => {
  return useMutation({
    mutationFn: ({ personId }: { personId: number }) =>
      favoritePersonsService.removeFavoritePerson(personId),
  });
};
