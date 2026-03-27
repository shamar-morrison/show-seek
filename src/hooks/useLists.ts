import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import {
  filterCustomLists,
  isDefaultList,
  MAX_FREE_ITEMS_PER_LIST,
  MAX_FREE_LISTS,
} from '@/src/constants/lists';
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import {
  buildListItemKey,
  getLegacyListItemKey,
  getListItemFromMap,
  hasListItemInMap,
} from '@/src/utils/listItemKeys';
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
import {
  areHomeScreenSelectionsEqual,
  normalizeHomeScreenSelections,
} from '../utils/homeScreenSelections';

// Stale time for TV show details prefetch (same as useUpcomingReleases)
const TV_DETAILS_STALE_TIME = 1000 * 60 * 30;

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
  const userId = user && !user.isAnonymous ? user.uid : undefined;
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

export const useMediaLists = (mediaId: number, mediaType: 'movie' | 'tv') => {
  // Detail-screen add-to-list state depends on this membership data.
  // Keep this active for signed-in users even when optional list indicator optimizations are disabled.
  const { data: lists, isLoading } = useLists();

  if (!lists) {
    return { membership: {}, isLoading: true };
  }

  const membership: Record<string, boolean> = {};
  lists.forEach((list) => {
    if (hasListItemInMap(list.items, mediaType, mediaId)) {
      membership[list.id] = true;
    }
  });

  return { membership, isLoading: isLoading || false };
};

export const useAddToList = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
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
      const hasHydratedListCache =
        listQueryState?.status === 'success' && previousLists !== undefined;
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
                [buildListItemKey(mediaItem.media_type, mediaItem.id)]: newItem,
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
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['lists', userId], refetchType: 'active' });
        void queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          refetchType: 'active',
        });
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
  const userId = user && !user.isAnonymous ? user.uid : undefined;

  return useMutation({
    mutationFn: ({
      listId,
      mediaId,
      mediaType,
    }: {
      listId: string;
      mediaId: number;
      mediaType: 'movie' | 'tv';
    }) => listService.removeFromList(listId, mediaId, mediaType),

    // Optimistic update - immediately show the item as removed
    onMutate: async ({ listId, mediaId, mediaType }) => {
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
      const hasHydratedListCache =
        listQueryState?.status === 'success' && previousLists !== undefined;
      const membershipQueryState = queryClient.getQueryState<ListMembershipIndex>([
        LIST_MEMBERSHIP_INDEX_QUERY_KEY,
        userId,
      ]);
      const hasHydratedMembershipCache =
        membershipQueryState?.status === 'success' && previousMembershipIndex !== undefined;
      const targetItem = getListItemFromMap(
        previousLists?.find((list) => list.id === listId)?.items,
        mediaType,
        mediaId
      ) as
        | ListMediaItem
        | undefined;

      let appliedListOptimisticUpdate = false;
      let appliedMembershipOptimisticUpdate = false;

      if (hasHydratedListCache) {
        queryClient.setQueryData<UserList[]>(['lists', userId], (oldLists) => {
          if (!oldLists) return oldLists;
          appliedListOptimisticUpdate = true;
          return oldLists.map((list) => {
            if (list.id === listId) {
              const remainingItems = { ...(list.items || {}) };
              delete remainingItems[buildListItemKey(mediaType, mediaId)];
              delete remainingItems[getLegacyListItemKey(mediaId)];
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
      if (userId) {
        void queryClient.invalidateQueries({ queryKey: ['lists', userId], refetchType: 'active' });
        void queryClient.invalidateQueries({
          queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
          refetchType: 'active',
        });
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
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  return useMutation({
    mutationFn: async ({ name, description }: { name: string; description?: string }) => {
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
    onSuccess: (listId, { name, description }) => {
      if (userId) {
        const listsQueryKey = ['lists', userId] as const;
        const previousLists = queryClient.getQueryData<UserList[]>(listsQueryKey);
        const listsQueryState = queryClient.getQueryState<UserList[]>(listsQueryKey);
        const hasHydratedListCache =
          listsQueryState?.status === 'success' && previousLists !== undefined;

        if (hasHydratedListCache) {
          const createdAt = Date.now();
          const trimmedDescription = description?.trim();

          queryClient.setQueryData<UserList[]>(listsQueryKey, (oldLists) => {
            if (!oldLists || oldLists.some((list) => list.id === listId)) {
              return oldLists;
            }

            return [
              ...oldLists,
              {
                id: listId,
                name,
                description: trimmedDescription ? trimmedDescription : undefined,
                items: {},
                createdAt,
              },
            ];
          });
        }

        queryClient.invalidateQueries({ queryKey: listsQueryKey });
      }
    },
  });
};

const removeDeletedListIdsFromMembershipIndex = (
  index: ListMembershipIndex,
  deletedListIds: Set<string>
): ListMembershipIndex => {
  let didChange = false;
  const nextIndex: ListMembershipIndex = {};

  Object.entries(index).forEach(([mediaKey, listIds]) => {
    const remainingListIds = listIds.filter((listId) => !deletedListIds.has(listId));
    if (remainingListIds.length !== listIds.length) {
      didChange = true;
    }

    if (remainingListIds.length > 0) {
      nextIndex[mediaKey] = remainingListIds;
    }
  });

  return didChange ? nextIndex : index;
};

const repairHomeScreenSelectionsAfterDeletedLists = async ({
  queryClient,
  userId,
  deletedListIds,
  remainingLists,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  userId: string;
  deletedListIds: Set<string>;
  remainingLists: UserList[] | undefined;
}) => {
  const preferencesQueryKey = ['preferences', userId] as const;
  let preferences = queryClient.getQueryData<UserPreferences>(preferencesQueryKey);

  if (!preferences) {
    try {
      preferences = await preferencesService.fetchPreferences(userId);
      queryClient.setQueryData<UserPreferences>(preferencesQueryKey, preferences);
    } catch (error) {
      console.error('Failed to fetch preferences after deleting lists:', error);
    }
  }

  const currentHomeScreenLists = preferences?.homeScreenLists;

  if (!currentHomeScreenLists) {
    return;
  }

  const filteredSelections = currentHomeScreenLists.filter(
    (item) => !(item.type === 'custom' && deletedListIds.has(item.id))
  );
  const remainingCustomLists =
    remainingLists && remainingLists.length > 0
      ? filterCustomLists(remainingLists).map((list) => ({
          id: list.id,
          name: list.name,
        }))
      : filteredSelections
          .filter((item) => item.type === 'custom')
          .map((item) => ({ id: item.id, name: item.label }));
  const updatedLists = normalizeHomeScreenSelections(filteredSelections, remainingCustomLists);

  if (areHomeScreenSelectionsEqual(updatedLists, currentHomeScreenLists)) {
    return;
  }

  try {
    await preferencesService.updatePreference('homeScreenLists', updatedLists);
    queryClient.setQueryData<UserPreferences>(preferencesQueryKey, (old) => ({
      ...(old ?? preferences ?? DEFAULT_PREFERENCES),
      homeScreenLists: updatedLists,
    }));
  } catch (error) {
    console.error('Failed to remove deleted lists from home screen:', error);
  }
};

const applyDeletedListsSuccess = async ({
  queryClient,
  userId,
  deletedListIds,
}: {
  queryClient: ReturnType<typeof useQueryClient>;
  userId: string | undefined;
  deletedListIds: string[];
}) => {
  if (!userId || deletedListIds.length === 0) {
    return;
  }

  const deletedListIdSet = new Set(deletedListIds);
  const listsQueryKey = ['lists', userId] as const;
  const membershipQueryKey = [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId] as const;

  const cachedLists = queryClient.getQueryData<UserList[]>(listsQueryKey);
  const listsQueryState = queryClient.getQueryState<UserList[]>(listsQueryKey);
  const hasHydratedListCache =
    listsQueryState?.status === 'success' && cachedLists !== undefined;

  let remainingLists: UserList[] | undefined;

  if (hasHydratedListCache) {
    remainingLists = (cachedLists ?? []).filter((list) => !deletedListIdSet.has(list.id));
    queryClient.setQueryData<UserList[]>(listsQueryKey, remainingLists);
  } else {
    try {
      remainingLists = await listService.getUserLists(userId);
      queryClient.setQueryData<UserList[]>(listsQueryKey, remainingLists);
    } catch (error) {
      console.error('Failed to fetch lists after deleting lists:', error);
    }
  }

  const cachedMembershipIndex = queryClient.getQueryData<ListMembershipIndex>(membershipQueryKey);
  const membershipQueryState = queryClient.getQueryState<ListMembershipIndex>(membershipQueryKey);
  const hasHydratedMembershipCache =
    membershipQueryState?.status === 'success' && cachedMembershipIndex !== undefined;

  if (hasHydratedMembershipCache) {
    queryClient.setQueryData<ListMembershipIndex>(membershipQueryKey, (oldIndex) => {
      if (!oldIndex) {
        return oldIndex;
      }

      return removeDeletedListIdsFromMembershipIndex(oldIndex, deletedListIdSet);
    });
  }

  await repairHomeScreenSelectionsAfterDeletedLists({
    queryClient,
    userId,
    deletedListIds: deletedListIdSet,
    remainingLists,
  });

  await queryClient.invalidateQueries({
    queryKey: listsQueryKey,
    refetchType: 'active',
  });
  await queryClient.invalidateQueries({
    queryKey: membershipQueryKey,
    refetchType: 'active',
  });
};

export const useDeleteList = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;

  return useMutation({
    mutationFn: (listId: string) => listService.deleteList(listId),
    onSuccess: async (_data, listId) => {
      await applyDeletedListsSuccess({
        queryClient,
        userId,
        deletedListIds: [listId],
      });
    },
    onError: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ['lists', userId],
        refetchType: 'active',
      });
      await queryClient.invalidateQueries({
        queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, userId],
        refetchType: 'active',
      });
    },
  });
};

export interface BulkDeleteListsVariables {
  listIds: string[];
  onProgress?: (processed: number, total: number) => void;
}

export interface BulkDeleteListsResult {
  deletedIds: string[];
  failedIds: string[];
}

export const useBulkDeleteLists = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user && !user.isAnonymous ? user.uid : undefined;

  return useMutation({
    mutationFn: async ({
      listIds,
      onProgress,
    }: BulkDeleteListsVariables): Promise<BulkDeleteListsResult> => {
      if (!userId) {
        throw new Error('User must be logged in');
      }

      const uniqueListIds = Array.from(new Set(listIds)).filter((listId) => !isDefaultList(listId));
      if (uniqueListIds.length === 0) {
        return { deletedIds: [], failedIds: [] };
      }

      const deletedIds: string[] = [];
      const failedIds: string[] = [];
      const total = uniqueListIds.length;
      let processed = 0;

      for (const listId of uniqueListIds) {
        try {
          await listService.deleteList(listId);
          deletedIds.push(listId);
        } catch {
          failedIds.push(listId);
        } finally {
          processed += 1;
          onProgress?.(processed, total);
        }
      }

      return { deletedIds, failedIds };
    },
    onSuccess: async ({ deletedIds }) => {
      await applyDeletedListsSuccess({
        queryClient,
        userId,
        deletedListIds: deletedIds,
      });
    },
    onError: async () => {
      if (!userId) {
        return;
      }

      await queryClient.invalidateQueries({
        queryKey: ['lists', userId],
        refetchType: 'active',
      });
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
  const userId = user && !user.isAnonymous ? user.uid : undefined;

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
