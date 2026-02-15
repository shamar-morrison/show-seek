import {
  DEFAULT_HOME_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '@/src/constants/homeScreenLists';
import { READ_OPTIMIZATION_FLAGS, READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { useAuth } from '@/src/context/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { auth } from '../firebase/config';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, HomeScreenListItem, UserPreferences } from '../types/preferences';

/**
 * Hook to read user preferences via query-based caching.
 */
export const usePreferences = () => {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const queryEnabled = !!userId && !authLoading;

  const query = useQuery({
    queryKey: ['preferences', userId],
    queryFn: () => preferencesService.fetchPreferences(userId!),
    enabled: queryEnabled,
    initialData: DEFAULT_PREFERENCES,
    initialDataUpdatedAt: 0,
    staleTime: READ_QUERY_CACHE_WINDOWS.preferencesStaleTimeMs,
    gcTime: READ_QUERY_CACHE_WINDOWS.preferencesGcTimeMs,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const isHydratingInitial = !!userId && query.fetchStatus === 'fetching' && query.dataUpdatedAt === 0;
  const hasLoaded =
    !userId || query.dataUpdatedAt > 0 || (!!query.error && query.fetchStatus !== 'fetching');
  const isLoading = isHydratingInitial;

  useEffect(() => {
    if (!__DEV__ || !READ_OPTIMIZATION_FLAGS.debugInitGateLogs) {
      return;
    }

    console.log('[usePreferences] Query lifecycle', {
      userId: userId ?? null,
      authLoading,
      enabled: queryEnabled,
      status: query.status,
      fetchStatus: query.fetchStatus,
      isLoading: query.isLoading,
      isHydratingInitial,
      isFetched: query.isFetched,
      dataUpdatedAt: query.dataUpdatedAt,
      hasLoaded,
      error: query.error ? String(query.error) : null,
      timestamp: Date.now(),
    });
  }, [
    authLoading,
    queryEnabled,
    query.status,
    query.fetchStatus,
    query.isLoading,
    query.isFetched,
    query.dataUpdatedAt,
    query.error,
    isHydratingInitial,
    hasLoaded,
    userId,
  ]);

  const preferences = useMemo(
    () => (userId ? (query.data ?? DEFAULT_PREFERENCES) : DEFAULT_PREFERENCES),
    [userId, query.data]
  );

  const homeScreenLists = preferences.homeScreenLists ?? DEFAULT_HOME_LISTS;

  const refetch = () => {
    if (userId) {
      queryClient.invalidateQueries({ queryKey: ['preferences', userId], exact: true });
    }
  };

  return {
    preferences,
    homeScreenLists,
    isLoading,
    hasLoaded,
    error: query.error,
    refetch,
  };
};

/**
 * Mutation hook for updating a preference with optimistic updates
 * Supports both boolean and string preference values
 */
type UpdatePreferenceVariables = {
  key: keyof UserPreferences;
  value: UserPreferences[keyof UserPreferences];
};

export const useUpdatePreference = () => {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    Error,
    UpdatePreferenceVariables,
    { previousPreferences?: UserPreferences; userId: string }
  >({
    mutationKey: ['updatePreference'],
    mutationFn: async ({ key, value }: UpdatePreferenceVariables) => {
      await preferencesService.updatePreference(key, value);
    },

    // Optimistic update
    onMutate: async ({ key, value }) => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('User must be logged in');

      await queryClient.cancelQueries({ queryKey: ['preferences', currentUserId] });

      const previousPreferences = queryClient.getQueryData<UserPreferences>([
        'preferences',
        currentUserId,
      ]);

      queryClient.setQueryData<UserPreferences>(['preferences', currentUserId], (old) => ({
        ...(old ?? DEFAULT_PREFERENCES),
        [key]: value,
      }));

      return { previousPreferences, userId: currentUserId };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousPreferences && context.userId) {
        queryClient.setQueryData(['preferences', context.userId], context.previousPreferences);
      }
    },

    // On success, allow query to refresh from server source
    onSettled: (_data, _error, _variables, context) => {
      if (context?.userId) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['preferences', context.userId] });
        }, 500);
      }
    },
  });
};

/**
 * Mutation hook for updating home screen list configuration
 */
export const useUpdateHomeScreenLists = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updateHomeScreenLists'],
    mutationFn: async (lists: HomeScreenListItem[]) => {
      // Validate constraints
      if (lists.length < MIN_HOME_LISTS) {
        throw new Error(`Select at least ${MIN_HOME_LISTS} list`);
      }
      if (lists.length > MAX_HOME_LISTS) {
        throw new Error(`Select at most ${MAX_HOME_LISTS} lists`);
      }
      await preferencesService.updatePreference('homeScreenLists', lists);
    },

    // Optimistic update
    onMutate: async (lists) => {
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) throw new Error('User must be logged in');

      await queryClient.cancelQueries({ queryKey: ['preferences', currentUserId] });

      const previousPreferences = queryClient.getQueryData<UserPreferences>([
        'preferences',
        currentUserId,
      ]);

      queryClient.setQueryData<UserPreferences>(['preferences', currentUserId], (old) => ({
        ...(old ?? DEFAULT_PREFERENCES),
        homeScreenLists: lists,
      }));

      return { previousPreferences, userId: currentUserId };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousPreferences && context.userId) {
        queryClient.setQueryData(['preferences', context.userId], context.previousPreferences);
      }
    },

    // On success, refresh server value in cache
    onSettled: (_data, _error, _variables, context) => {
      if (context?.userId) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['preferences', context.userId] });
        }, 500);
      }
    },
  });
};
