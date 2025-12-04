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
  });
};

export const useRemoveFromList = () => {
  return useMutation({
    mutationFn: ({ listId, mediaId }: { listId: string; mediaId: number }) =>
      listService.removeFromList(listId, mediaId),
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
