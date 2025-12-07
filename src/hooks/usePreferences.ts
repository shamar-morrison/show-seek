import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

/**
 * Hook to subscribe to user preferences with real-time updates
 */
export const usePreferences = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [subscriptionData, setSubscriptionData] = useState<UserPreferences | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(!!userId);
  const [retryTrigger, setRetryTrigger] = useState(0);

  // Refetch function to retry loading preferences after an error
  const refetch = useCallback(() => {
    setError(null);
    setIsLoading(true);
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      setSubscriptionData(null);
      return;
    }

    setError(null);
    setIsLoading(true);

    const unsubscribe = preferencesService.subscribeToPreferences(
      (preferences) => {
        setSubscriptionData(preferences);
        setError(null);
        setIsLoading(false);
      },
      (err) => {
        setError(err);
        setIsLoading(false);
        console.error('[usePreferences] Subscription error:', err);
      }
    );

    return () => unsubscribe();
  }, [userId, retryTrigger]);

  // Use query for caching and optimistic updates
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

  // Guard by userId: if no user, always return defaults regardless of stale subscriptionData/query cache
  return {
    preferences: userId ? (preferences ?? DEFAULT_PREFERENCES) : DEFAULT_PREFERENCES,
    isLoading,
    error,
    refetch,
  };
};

/**
 * Mutation hook for updating a preference with optimistic updates
 */
export const useUpdatePreference = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['updatePreference'],
    mutationFn: async ({ key, value }: { key: keyof UserPreferences; value: boolean }) => {
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
