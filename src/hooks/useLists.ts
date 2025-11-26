import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { ListMediaItem, listService, UserList } from '../services/ListService';

export const useLists = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!userId) return;

    setError(null); // Reset error on new subscription

    const unsubscribe = listService.subscribeToUserLists(
      (lists) => {
        queryClient.setQueryData(['lists', userId], lists);
        setError(null); // Clear error on successful update
      },
      (err) => {
        setError(err);
        console.error('[useLists] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, queryClient]);

  return useQuery({
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
};

export const useMediaLists = (mediaId: number) => {
  const { data: lists } = useLists();

  if (!lists) return {};

  const membership: Record<string, boolean> = {};
  lists.forEach((list) => {
    if (list.items && list.items[mediaId]) {
      membership[list.id] = true;
    }
  });

  return membership;
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
