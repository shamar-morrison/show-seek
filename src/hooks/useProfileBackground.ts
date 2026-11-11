import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import type { ProfileBackground } from '@/src/utils/profileBackground';
import { useCallback } from 'react';

/** The person's profile background, and setting or removing it (saved to their preferences). */
export function useProfileBackground() {
  const { preferences } = usePreferences();
  const updatePreference = useUpdatePreference();

  const setProfileBackground = useCallback(
    (background: ProfileBackground | null) =>
      updatePreference.mutateAsync({ key: 'profileBackground', value: background }),
    [updatePreference]
  );

  return {
    profileBackground: preferences?.profileBackground ?? null,
    setProfileBackground,
    isSaving: updatePreference.isPending,
  };
}
