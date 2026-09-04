/**
 * Hook for invalidating user library queries on Trakt sync/enrichment/import completion
 */

import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from 'firebase/auth';
import { useCallback } from 'react';

export interface UseTraktQueryInvalidationOptions {
  user: User | null;
}

export function useTraktQueryInvalidation({ user }: UseTraktQueryInvalidationOptions) {
  const queryClient = useQueryClient();

  const invalidateUserLibraryQueries = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lists', user.uid] }),
      queryClient.invalidateQueries({
        queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, user.uid],
      }),
      queryClient.invalidateQueries({ queryKey: ['ratings', user.uid] }),
      queryClient.invalidateQueries({ queryKey: ['watchedMovies', user.uid] }),
      queryClient.invalidateQueries({ queryKey: ['episodeTracking'] }),
    ]);
  }, [queryClient, user?.uid]);

  return { invalidateUserLibraryQueries };
}
