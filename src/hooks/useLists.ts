import { MAX_FREE_ITEMS_PER_LIST, MAX_FREE_LISTS } from '@/src/constants/lists';
import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { tmdbApi } from '../api/tmdb';
import { useAuth } from '../context/auth';
import { usePremium } from '../context/PremiumContext';
import {
  DEFAULT_LISTS,
  ListMediaItem,
  ListMembershipIndex,
  listService,
  UserList,
} from '../services/ListService';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

// Stale time for TV show details prefetch (same as useUpcomingReleases)
const TV_DETAILS_STALE_TIME = 1000 * 60 * 30;
const LIST_MEMBERSHIP_INDEX_QUERY_KEY = 'list-membership-index';

const getMediaMembershipKey = (mediaItem: Pick<ListMediaItem, 'id' | 'media_type'>) =>
  `${mediaItem.id}-${mediaItem.media_type}`;

const addListIdToMembershipIndex = (
  index: ListMembershipIndex,
  mediaKey: string,
  listId: string
): ListMembershipIndex => {
  const existingListIds = index[mediaKey] || [];
  if (existingListIds.includes(listId)) {
    return index;
  }

  return {
    ...index,
    [mediaKey]: [...existingListIds, listId],
  };
};

const removeListIdFromMembershipIndex = (
  index: ListMembershipIndex,
  mediaKey: string,
  listId: string
): ListMembershipIndex => {
  const existingListIds = index[mediaKey] || [];
  if (!existingListIds.length) {
    return index;
  }

  const remainingListIds = existingListIds.filter((id) => id !== listId);
  if (remainingListIds.length === existingListIds.length) {
    return index;
  }

  if (remainingListIds.length === 0) {
    const { [mediaKey]: _removed, ...rest } = index;
    return rest;
  }

  return {
    ...index,
    [mediaKey]: remainingListIds,
  };
};

type UseListsOptions = {
  enabled?: boolean;
};

export const useLists = (options: UseListsOptions = {}) => {
  const { enabled = true } = options;
  const { user } = useAuth();
  const userId = user?.uid;
  const query = useQuery({
    queryKey: ['lists', userId],
    queryFn: () => listService.getUserLists(userId!),
    enabled: !!userId && enabled,
    staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
  });

  return {
    ...query,
    data: query.data ?? [],
  };
};

export const useMediaLists = (mediaId: number) => {
  const shouldLoadIndicators =
    !READ_OPTIMIZATION_FLAGS.liteModeEnabled ||
    READ_OPTIMIZATION_FLAGS.enableListIndicatorsInLiteMode;
  const { data: lists, isLoading } = useLists({ enabled: shouldLoadIndicators });

  if (!shouldLoadIndicators) {
    return { membership: {}, isLoading: false };
  }

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
  const { user } = useAuth();
  const userId = user?.uid;
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
      await queryClient.cancelQueries({ queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId] });

      // Snapshot the previous value
      const previousLists = queryClient.getQueryData<UserList[]>(['lists', userId]);
      const previousMembershipIndex = queryClient.getQueryData<ListMembershipIndex>([
        LIST_MEMBERSHIP_INDEX_QUERY_KEY,
        userId,
      ]);
      const listQueryState = queryClient.getQueryState<UserList[]>(['lists', userId]);
      const hasHydratedListCache = listQueryState?.status === 'success' && previousLists !== undefined;
      const membershipQueryState = queryClient.getQueryState<ListMembershipIndex>([
        LIST_MEMBERSHIP_INDEX_QUERY_KEY,
        userId,
      ]);
      const hasHydratedMembershipCache =
        membershipQueryState?.status === 'success' && previousMembershipIndex !== undefined;

      const newItem: ListMediaItem = {
        ...mediaItem,
        addedAt: Date.now(),
      } as ListMediaItem;

      let appliedListOptimisticUpdate = false;
      let appliedMembershipOptimisticUpdate = false;

      if (hasHydratedListCache) {
        queryClient.setQueryData<UserList[]>(['lists', userId], (oldLists) => {
          if (!oldLists) {
            return oldLists;
          }

          const listExists = oldLists.some((list) => list.id === listId);
          if (!listExists) {
            return oldLists;
          }

          appliedListOptimisticUpdate = true;
          return oldLists.map((list) => {
            if (list.id !== listId) {
              return list;
            }

            return {
              ...list,
              name: listName || list.name,
              items: {
                ...list.items,
                [mediaItem.id]: newItem,
              },
              updatedAt: Date.now(),
            };
          });
        });
      }

      if (hasHydratedMembershipCache) {
        queryClient.setQueryData<ListMembershipIndex>(
          [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          (oldIndex) => {
            if (!oldIndex) {
              return oldIndex;
            }

            appliedMembershipOptimisticUpdate = true;
            return addListIdToMembershipIndex(oldIndex, getMediaMembershipKey(newItem), listId);
          }
        );
      }

      return {
        previousLists,
        previousMembershipIndex,
        skippedListOptimisticUpdate: !appliedListOptimisticUpdate,
        skippedMembershipOptimisticUpdate: !appliedMembershipOptimisticUpdate,
      };
    },

    // If mutation fails, rollback to the previous value
    onError: (_err, _variables, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(['lists', userId], context.previousLists);
      }
      if (context?.previousMembershipIndex) {
        queryClient.setQueryData(
          [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          context.previousMembershipIndex
        );
      }
    },

    // Prefetch TV show details for the Calendar feature
    onSuccess: async (_data, { mediaItem }, context) => {
      // Only prefetch for TV shows - movies already have release_date in the list item
      if (mediaItem.media_type === 'tv') {
        queryClient.prefetchQuery({
          queryKey: ['tv', mediaItem.id, 'calendar-enrichment'],
          queryFn: () => tmdbApi.getTVShowDetails(mediaItem.id),
          staleTime: TV_DETAILS_STALE_TIME,
        });
      }

      if (userId && context?.skippedListOptimisticUpdate) {
        await queryClient.invalidateQueries({
          queryKey: ['lists', userId],
          refetchType: 'active',
        });
      }

      if (userId && context?.skippedMembershipOptimisticUpdate) {
        await queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          refetchType: 'active',
        });
      }
    },
  });
};

export const useRemoveFromList = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: ({ listId, mediaId }: { listId: string; mediaId: number }) =>
      listService.removeFromList(listId, mediaId),

    // Optimistic update - immediately show the item as removed
    onMutate: async ({ listId, mediaId }) => {
      if (!userId) {
        throw new Error('User must be logged in');
      }

      await queryClient.cancelQueries({ queryKey: ['lists', userId] });
      await queryClient.cancelQueries({ queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId] });

      const previousLists = queryClient.getQueryData<UserList[]>(['lists', userId]);
      const previousMembershipIndex = queryClient.getQueryData<ListMembershipIndex>([
        LIST_MEMBERSHIP_INDEX_QUERY_KEY,
        userId,
      ]);
      const listQueryState = queryClient.getQueryState<UserList[]>(['lists', userId]);
      const hasHydratedListCache = listQueryState?.status === 'success' && previousLists !== undefined;
      const membershipQueryState = queryClient.getQueryState<ListMembershipIndex>([
        LIST_MEMBERSHIP_INDEX_QUERY_KEY,
        userId,
      ]);
      const hasHydratedMembershipCache =
        membershipQueryState?.status === 'success' && previousMembershipIndex !== undefined;
      const targetItem = previousLists
        ?.find((list) => list.id === listId)
        ?.items?.[mediaId] as ListMediaItem | undefined;

      let appliedListOptimisticUpdate = false;
      let appliedMembershipOptimisticUpdate = false;

      if (hasHydratedListCache) {
        queryClient.setQueryData<UserList[]>(['lists', userId], (oldLists) => {
          if (!oldLists) return oldLists;
          appliedListOptimisticUpdate = true;
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

      if (hasHydratedMembershipCache && targetItem?.media_type) {
        queryClient.setQueryData<ListMembershipIndex>(
          [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          (oldIndex) => {
            if (!oldIndex) {
              return oldIndex;
            }

            appliedMembershipOptimisticUpdate = true;
            return removeListIdFromMembershipIndex(
              oldIndex,
              getMediaMembershipKey({ id: mediaId, media_type: targetItem.media_type }),
              listId
            );
          }
        );
      }

      return {
        previousLists,
        previousMembershipIndex,
        skippedListOptimisticUpdate: !appliedListOptimisticUpdate,
        skippedMembershipOptimisticUpdate: !appliedMembershipOptimisticUpdate,
      };
    },

    onError: (_err, _variables, context) => {
      if (context?.previousLists) {
        queryClient.setQueryData(['lists', userId], context.previousLists);
      }
      if (context?.previousMembershipIndex) {
        queryClient.setQueryData(
          [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          context.previousMembershipIndex
        );
      }
    },

    onSuccess: async (_data, _variables, context) => {
      if (userId && context?.skippedListOptimisticUpdate) {
        await queryClient.invalidateQueries({
          queryKey: ['lists', userId],
          refetchType: 'active',
        });
      }

      if (userId && context?.skippedMembershipOptimisticUpdate) {
        await queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          refetchType: 'active',
        });
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
  const { user } = useAuth();
  const userId = user?.uid;
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
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['lists', userId] });
      }
    },
  });
};

export const useDeleteList = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation({
    mutationFn: (listId: string) => listService.deleteList(listId),
    onSuccess: async (_data, listId) => {
      // Clean up home screen preferences to remove the deleted custom list
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

      await queryClient.invalidateQueries({ queryKey: ['lists', userId] });
      await queryClient.invalidateQueries({
        queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
        refetchType: 'active',
      });
    },
  });
};

export const useRenameList = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

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
    onSuccess: () => {
      if (userId) {
        queryClient.invalidateQueries({ queryKey: ['lists', userId] });
      }
    },
  });
};
