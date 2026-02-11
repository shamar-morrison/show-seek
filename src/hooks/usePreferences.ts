import {
  DEFAULT_HOME_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '@/src/constants/homeScreenLists';
import { useAuth } from '@/src/context/auth';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase/config';
import { useRealtimeSubscription } from './useRealtimeSubscription';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, HomeScreenListItem, UserPreferences } from '../types/preferences';

/**
 * Hook to subscribe to user preferences with real-time updates
 * Uses useAuth to get the user reactively instead of reading auth.currentUser directly
 */
export const usePreferences = () => {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.uid;
  const [retryTrigger, setRetryTrigger] = useState(0);

  const subscribe = useCallback(
    (onData: (preferences: UserPreferences) => void, onError: (error: Error) => void) =>
      preferencesService.subscribeToPreferences(onData, onError),
    [retryTrigger]
  );

  const query = useRealtimeSubscription<UserPreferences>({
    queryKey: ['preferences', userId],
    enabled: !!userId && !authLoading,
    initialData: DEFAULT_PREFERENCES,
    subscribe,
    logLabel: 'usePreferences',
  });

  const hasLoaded = !!userId && query.hasReceivedData;
  const isLoading = !!userId && !query.hasReceivedData;

  const preferences = useMemo(
    () => (userId ? (query.data ?? DEFAULT_PREFERENCES) : DEFAULT_PREFERENCES),
    [userId, query.data]
  );

  const homeScreenLists = preferences.homeScreenLists ?? DEFAULT_HOME_LISTS;

  const refetch = useCallback(() => {
    if (userId) {
      queryClient.removeQueries({ queryKey: ['preferences', userId], exact: true });
    }
    setRetryTrigger((prev) => prev + 1);
  }, [queryClient, userId]);

  // Keep query cache in sync unless an optimistic mutation is in progress.
  useEffect(() => {
    if (!userId || !query.data) return;

    const isMutating = queryClient.isMutating({ mutationKey: ['updatePreference'] }) > 0;
    if (!isMutating) {
      queryClient.setQueryData(['preferences', userId], query.data);
    }
  }, [userId, query.data, queryClient]);

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

    // On success, allow subscription to update cache again
    onSettled: (_data, _error, _variables, context) => {
      // Small delay to let Firestore subscription catch up with the correct value
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

    // On success, allow subscription to update cache again
    onSettled: (_data, _error, _variables, context) => {
      if (context?.userId) {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['preferences', context.userId] });
        }, 500);
      }
    },
  });
};
