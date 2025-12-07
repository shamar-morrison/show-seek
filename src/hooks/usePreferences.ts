import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { auth } from '../firebase/config';
import { preferencesService } from '../services/PreferencesService';
import { DEFAULT_PREFERENCES, UserPreferences } from '../types/preferences';

/**
 * Hook to subscribe to user preferences with real-time updates
 */
export const usePreferences = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(() => {
    if (!userId) return false;
    return !queryClient.getQueryData(['preferences', userId]);
  });

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    setError(null);
    if (!queryClient.getQueryData(['preferences', userId])) {
      setIsLoading(true);
    }

    const unsubscribe = preferencesService.subscribeToPreferences(
      (preferences) => {
        queryClient.setQueryData(['preferences', userId], preferences);
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
  }, [userId, queryClient]);

  const preferences =
    queryClient.getQueryData<UserPreferences>(['preferences', userId]) ?? DEFAULT_PREFERENCES;

  return {
    preferences,
    isLoading,
    error,
  };
};

/**
 * Mutation hook for updating a preference with optimistic updates
 */
export const useUpdatePreference = () => {
  const queryClient = useQueryClient();
  const userId = auth.currentUser?.uid;

  return useMutation({
    mutationFn: async ({ key, value }: { key: keyof UserPreferences; value: boolean }) => {
      await preferencesService.updatePreference(key, value);
    },

    // Optimistic update
    onMutate: async ({ key, value }) => {
      if (!userId) throw new Error('User must be logged in');

      await queryClient.cancelQueries({ queryKey: ['preferences', userId] });

      const previousPreferences = queryClient.getQueryData<UserPreferences>([
        'preferences',
        userId,
      ]);

      queryClient.setQueryData<UserPreferences>(['preferences', userId], (old) => ({
        ...(old ?? DEFAULT_PREFERENCES),
        [key]: value,
      }));

      return { previousPreferences };
    },

    // Rollback on error
    onError: (_err, _variables, context) => {
      if (context?.previousPreferences) {
        queryClient.setQueryData(['preferences', userId], context.previousPreferences);
      }
    },
  });
};
