import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { ListMediaItem, listService, UserList } from '../services/ListService';

export const useLists = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(() => {
    if (!userId) return true;
    return !queryClient.getQueryData(['lists', userId]);
  });

  useEffect(() => {
    if (!userId) {
      setIsSubscriptionLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(['lists', userId])) {
      setIsSubscriptionLoading(true);
    }

    const unsubscribe = listService.subscribeToUserLists(
      (lists) => {
        queryClient.setQueryData(['lists', userId], lists);
        setError(null);
        setIsSubscriptionLoading(false);
      },
      (err) => {
        setError(err);
        setIsSubscriptionLoading(false);
        console.error('[useLists] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  const query = useQuery({
    queryKey: ['lists', userId],
    queryFn: () => {
      // Initial data is handled by subscription, but we need a queryFn
      // We can return existing data or empty array if not yet populated
      return queryClient.getQueryData<UserList[]>(['lists', userId]) || [];
    },
    enabled: !!userId,
    staleTime: Infinity, // Data is updated via subscription
    meta: { error }, // Attach error to query meta
  });

  return {
    ...query,
    isLoading: isSubscriptionLoading,
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

  return useMutation({
    mutationFn: ({
      listId,
      mediaItem,
      listName,
    }: {
      listId: string;
      mediaItem: Omit<ListMediaItem, 'addedAt'>;
      listName?: string;
    }) => listService.addToList(listId, mediaItem, listName),

    // Optimistic update - immediately show the item as added
    onMutate: async ({ listId, mediaItem, listName }) => {
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

export const useCreateList = () => {
  return useMutation({
    mutationFn: (listName: string) => listService.createList(listName),
  });
};

export const useDeleteList = () => {
  return useMutation({
    mutationFn: (listId: string) => listService.deleteList(listId),
  });
};
