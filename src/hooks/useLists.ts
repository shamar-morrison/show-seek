import { MAX_FREE_ITEMS_PER_LIST, MAX_FREE_LISTS } from '@/src/constants/lists';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { tmdbApi } from '../api/tmdb';
import { usePremium } from '../context/PremiumContext';
import { auth } from '../firebase/config';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { DEFAULT_LISTS, ListMediaItem, listService, UserList } from '../services/ListService';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

// Stale time for TV show details prefetch (same as useUpcomingReleases)
const TV_DETAILS_STALE_TIME = 1000 * 60 * 30;

export const useLists = () => {
  const userId = auth.currentUser?.uid;
  const subscribe = useCallback(
    (onData: (data: UserList[]) => void, onError: (error: Error) => void) =>
      listService.subscribeToUserLists(onData, onError),
    []
  );

  const query = useRealtimeSubscription<UserList[]>({
    queryKey: ['lists', userId],
    enabled: !!userId,
    initialData: [],
    subscribe,
    logLabel: 'useLists',
  });

  return {
    ...query,
  };
};

export const useMediaLists = (mediaId: number) => {
  const { data: lists, isLoading } = useLists();

  if (!lists) {
    return { membership: {}, isLoading: true };
  }

  const membership: Record<string, boolean> = {};
  lists.forEach((list) => {
    if (list.items && list.items[mediaId]) {
      membership[list.id] = true;
    }
  });

  return { membership, isLoading: isLoading || false };
};

export const useAddToList = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  return useMutation({
    mutationFn: async ({
      listId,
      mediaItem,
      listName,
    }: {
      listId: string;
      mediaItem: Omit<ListMediaItem, 'addedAt'>;
      listName?: string;
    }) => {
      return listService.addToList(listId, mediaItem, listName);
    },

    // Optimistic update - immediately show the item as added
    onMutate: async ({ listId, mediaItem, listName }) => {
      // Check limits FIRST, before the optimistic update
      // This must happen here because onMutate runs before mutationFn
      if (!isPremium && !isPremiumLoading) {
        const lists = queryClient.getQueryData<UserList[]>(['lists', userId]);
        const targetList = lists?.find((l) => l.id === listId);
        const currentCount = targetList ? Object.keys(targetList.items || {}).length : 0;

        if (currentCount >= MAX_FREE_ITEMS_PER_LIST) {
          throw new PremiumLimitError(
            `Free users can only add up to ${MAX_FREE_ITEMS_PER_LIST} items per list. Upgrade to Premium for unlimited items!`
          );
        }
      }

      // Cancel any outgoing refetches so they don't overwrite our optimistic update
      await queryClient.cancelQueries({ queryKey: ['lists', userId] });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<UserList[]>(['lists', userId]);

      // Optimistically update the cache
      const newItem: ListMediaItem = {
        ...mediaItem,
        addedAt: Date.now(),
      } as ListMediaItem;

      queryClient.setQueryData<UserList[]>(['lists', userId], (oldLists) => {
        if (!oldLists) {
          // No lists in cache yet - create array with new list
          return [
            {
              id: listId,
              name: listName || listId,
              items: { [mediaItem.id]: newItem },
              createdAt: Date.now(),
            },
          ];
        }

        // Check if the list exists in the cache
        const listExists = oldLists.some((list) => list.id === listId);

        if (listExists) {
          // Update existing list
          return oldLists.map((list) => {
            if (list.id === listId) {
              return {
                ...list,
                items: {
                  ...list.items,
                  [mediaItem.id]: newItem,
                },
              };
            }
            return list;
          });
        } else {
          // List doesn't exist - append new list
          return [
            ...oldLists,
            {
              id: listId,
              name: listName || listId,
              items: { [mediaItem.id]: newItem },
              createdAt: Date.now(),
            },
          ];
        }
      });

      return { previousLists };
    },

    // If mutation fails, rollback to the previous value
    onError: (_err, _variables, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(['lists', userId], context.previousLists);
      }
    },

    // Prefetch TV show details for the Calendar feature
    onSuccess: (_data, { mediaItem }) => {
      // Only prefetch for TV shows - movies already have release_date in the list item
      if (mediaItem.media_type === 'tv') {
        queryClient.prefetchQuery({
          queryKey: ['tv', mediaItem.id, 'calendar-enrichment'],
          queryFn: () => tmdbApi.getTVShowDetails(mediaItem.id),
          staleTime: TV_DETAILS_STALE_TIME,
        });
      }
    },
  });
};

export const useRemoveFromList = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationFn: ({ listId, mediaId }: { listId: string; mediaId: number }) =>
      listService.removeFromList(listId, mediaId),

    // Optimistic update - immediately show the item as removed
    onMutate: async ({ listId, mediaId }) => {
      if (!userId) {
        throw new Error('User must be logged in');
      }

      await queryClient.cancelQueries({ queryKey: ['lists', userId] });

      const previousLists = queryClient.getQueryData<UserList[]>(['lists', userId]);

      if (previousLists) {
        queryClient.setQueryData<UserList[]>(['lists', userId], (oldLists) => {
          if (!oldLists) return oldLists;
          return oldLists.map((list) => {
            if (list.id === listId) {
              const { [mediaId]: _, ...remainingItems } = list.items || {};
              return {
                ...list,
                items: remainingItems,
              };
            }
            return list;
          });
        });
      }

      return { previousLists };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(['lists', userId], context.previousLists);
      }
    },
  });
};

// Custom error class for premium limit errors
export class PremiumLimitError extends Error {
  code = 'PREMIUM_LIMIT';
  constructor(message: string) {
    super(message);
    this.name = 'PremiumLimitError';
  }
}

export const useCreateList = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  return useMutation({
    mutationFn: async ({
      name,
      description,
    }: {
      name: string;
      description?: string;
    }) => {
      // Check limits only when premium status is confirmed (not loading)
      if (!isPremium && !isPremiumLoading) {
        const lists = queryClient.getQueryData<UserList[]>(['lists', userId]);
        // Count only custom lists (not in DEFAULT_LISTS)
        const customLists = lists?.filter((l) => !DEFAULT_LISTS.some((d) => d.id === l.id)) || [];

        if (customLists.length >= MAX_FREE_LISTS) {
          throw new PremiumLimitError(
            'Free users can only create 5 custom lists. Upgrade to Premium for unlimited lists!'
          );
        }
      }
      return listService.createList(name, description);
    },
  });
};

export const useDeleteList = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listId: string) => listService.deleteList(listId),
    onSuccess: async (_data, listId) => {
      // Clean up home screen preferences to remove the deleted custom list
      const userId = auth.currentUser?.uid;
      if (!userId) return;

      const preferences = queryClient.getQueryData<UserPreferences>(['preferences', userId]);
      const currentHomeScreenLists = preferences?.homeScreenLists;

      if (currentHomeScreenLists) {
        // Filter out the deleted custom list
        const updatedLists = currentHomeScreenLists.filter(
          (item) => !(item.type === 'custom' && item.id === listId)
        );

        // Only update if the list was actually in home screen preferences
        if (updatedLists.length !== currentHomeScreenLists.length) {
          try {
            await preferencesService.updatePreference('homeScreenLists', updatedLists);
            // Also update the query cache immediately for optimistic UI update
            queryClient.setQueryData<UserPreferences>(['preferences', userId], (old) => ({
              ...(old ?? DEFAULT_PREFERENCES),
              homeScreenLists: updatedLists,
            }));
          } catch (error) {
            console.error('Failed to remove deleted list from home screen:', error);
          }
        }
      }
    },
  });
};

export const useRenameList = () => {
  return useMutation({
    mutationFn: ({
      listId,
      newName,
      newDescription,
    }: {
      listId: string;
      newName: string;
      newDescription?: string;
    }) => listService.renameList(listId, newName, newDescription),
  });
};
