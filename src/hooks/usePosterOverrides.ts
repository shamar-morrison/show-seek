import { useAuth } from '@/src/context/auth';
import { posterOverrideService } from '@/src/services/PosterOverrideService';
import { DEFAULT_PREFERENCES, UserPreferences } from '@/src/types/preferences';
import {
  buildPosterOverrideKey,
  resolvePosterPath as resolvePosterPathForMedia,
  sanitizePosterOverrides,
  type PosterOverrideMediaType,
} from '@/src/utils/posterOverrides';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { usePreferences } from './usePreferences';

type UpdatePosterOverrideContext = {
  previousPreferences?: UserPreferences;
  userId: string;
};

export function usePosterOverrides() {
  const { preferences } = usePreferences();

  const overrides = useMemo(
    () => sanitizePosterOverrides(preferences?.posterOverrides ?? DEFAULT_PREFERENCES.posterOverrides),
    [preferences?.posterOverrides]
  );

  const resolvePosterPath = useCallback(
    (
      mediaType: PosterOverrideMediaType,
      mediaId: number,
      fallbackPosterPath: string | null | undefined
    ) => resolvePosterPathForMedia(overrides, mediaType, mediaId, fallbackPosterPath),
    [overrides]
  );

  return {
    overrides,
    resolvePosterPath,
  };
}

export function useSetPosterOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation<
    void,
    Error,
    { mediaType: PosterOverrideMediaType; mediaId: number; posterPath: string },
    UpdatePosterOverrideContext
  >({
    mutationKey: ['setPosterOverride'],
    mutationFn: async ({ mediaType, mediaId, posterPath }) => {
      await posterOverrideService.setPosterOverride(mediaType, mediaId, posterPath);
    },
    onMutate: async ({ mediaType, mediaId, posterPath }) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const queryKey = ['preferences', userId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previousPreferences = queryClient.getQueryData<UserPreferences>(queryKey);
      const key = buildPosterOverrideKey(mediaType, mediaId);

      queryClient.setQueryData<UserPreferences>(queryKey, (old) => {
        const current = old ?? DEFAULT_PREFERENCES;
        return {
          ...current,
          posterOverrides: {
            ...sanitizePosterOverrides(current.posterOverrides),
            [key]: posterPath,
          },
        };
      });

      return { previousPreferences, userId };
    },
    onError: (_error, _variables, context) => {
      if (!context?.userId) return;

      queryClient.setQueryData(
        ['preferences', context.userId],
        context.previousPreferences ?? DEFAULT_PREFERENCES
      );
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context?.userId) return;
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['preferences', context.userId] });
      }, 500);
    },
  });
}

export function useClearPosterOverride() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const userId = user?.uid;

  return useMutation<
    void,
    Error,
    { mediaType: PosterOverrideMediaType; mediaId: number },
    UpdatePosterOverrideContext
  >({
    mutationKey: ['clearPosterOverride'],
    mutationFn: async ({ mediaType, mediaId }) => {
      await posterOverrideService.clearPosterOverride(mediaType, mediaId);
    },
    onMutate: async ({ mediaType, mediaId }) => {
      if (!userId) {
        throw new Error('Please sign in to continue');
      }

      const queryKey = ['preferences', userId] as const;
      await queryClient.cancelQueries({ queryKey });
      const previousPreferences = queryClient.getQueryData<UserPreferences>(queryKey);
      const key = buildPosterOverrideKey(mediaType, mediaId);

      queryClient.setQueryData<UserPreferences>(queryKey, (old) => {
        const current = old ?? DEFAULT_PREFERENCES;
        const nextOverrides = { ...sanitizePosterOverrides(current.posterOverrides) };
        delete nextOverrides[key];

        return {
          ...current,
          posterOverrides: nextOverrides,
        };
      });

      return { previousPreferences, userId };
    },
    onError: (_error, _variables, context) => {
      if (!context?.userId) return;

      queryClient.setQueryData(
        ['preferences', context.userId],
        context.previousPreferences ?? DEFAULT_PREFERENCES
      );
    },
    onSettled: (_data, _error, _variables, context) => {
      if (!context?.userId) return;
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['preferences', context.userId] });
      }, 500);
    },
  });
}
