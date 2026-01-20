import {
  DEFAULT_HOME_LISTS,
  MAX_HOME_LISTS,
  MIN_HOME_LISTS,
} from '@/src/constants/homeScreenLists';
import { useAuth } from '@/src/context/auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, HomeScreenListItem, UserPreferences } from '../types/preferences';

/**
 * Hook to subscribe to user preferences with real-time updates
 * Uses useAuth to get the user reactively instead of reading auth.currentUser directly
 */
export const usePreferences = () => {
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  // Use user from useAuth context to ensure we have the correct reactive state
  const userId = user?.uid;
  const [subscriptionData, setSubscriptionData] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!!userId);
  const [hasLoaded, setHasLoaded] = useState(false); // Track if data was actually fetched
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Refetch function to retry loading preferences after an error
  const refetch = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    // Reset subscriptionData unconditionally when userId changes
    // to avoid leaking the previous user's preferences
    setSubscriptionData(null);
    setHasLoaded(false);

    if (!userId) {
      setIsLoading(false);
      return;
    }

    setError(null);
    setIsLoading(true);

    const unsubscribe = preferencesService.subscribeToPreferences(
      (preferences) => {
        setSubscriptionData(preferences);
        setError(null);
        setIsLoading(false);
        setHasLoaded(true); // Mark as loaded when we get data
      },
      (err) => {
        setError(err);
        setIsLoading(false);
        console.error('[usePreferences] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, retryTrigger]);

  const { data: preferences } = useQuery({
    queryKey: ['preferences', userId],
    queryFn: () => subscriptionData ?? DEFAULT_PREFERENCES,
    enabled: !!userId && subscriptionData !== null,
    initialData: subscriptionData ?? DEFAULT_PREFERENCES,
    staleTime: Infinity,
  });

  // Sync subscription data to query cache when it changes
  useEffect(() => {
    if (userId && subscriptionData !== null) {
      // Only update if not currently mutating
      const isMutating = queryClient.isMutating({ mutationKey: ['updatePreference'] }) > 0;
      if (!isMutating) {
        queryClient.setQueryData(['preferences', userId], subscriptionData);
      }
    }
  }, [subscriptionData, userId, queryClient]);

  // Derive effective home screen lists (with fallback to defaults)
  const homeScreenLists = preferences?.homeScreenLists ?? DEFAULT_HOME_LISTS;

  return {
    preferences: userId ? (preferences ?? DEFAULT_PREFERENCES) : DEFAULT_PREFERENCES,
    homeScreenLists,
    isLoading,
    hasLoaded, // Export this for consumers that need to know if data was fetched
    error,
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
