import { useMutation } from '@tanstack/react-query';
import { useCallback } from 'react';
import { useAuth } from '../context/auth';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { favoritePersonsService } from '../services/FavoritePersonsService';
import { FavoritePerson } from '../types/favoritePerson';

export const useFavoritePersons = () => {
  const { user } = useAuth();
  const userId = user?.uid;
  const subscribe = useCallback(
    (onData: (data: FavoritePerson[]) => void, onError: (error: Error) => void) =>
      favoritePersonsService.subscribeToFavoritePersons(onData, onError),
    []
  );

  const query = useRealtimeSubscription<FavoritePerson[]>({
    queryKey: ['favoritePersons', userId],
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useFavoritePersons',
  });

  return {
    ...query,
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
    isLoading,
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
