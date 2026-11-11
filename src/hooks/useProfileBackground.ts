import { usePreferences, useUpdatePreference } from '@/src/hooks/usePreferences';
import { getProfileBackgroundFocus, type ProfileBackground } from '@/src/utils/profileBackground';
import { useCallback } from 'react';

/** The person's profile background, and setting or removing it (saved to their preferences). */
export function useProfileBackground() {
  const { preferences } = usePreferences();
  const updatePreference = useUpdatePreference();

  // Always saved with its focus: preferences are merged into the saved document, so leaving it out
  // would keep the previous image's focus.
  const setProfileBackground = useCallback(
    (background: ProfileBackground | null) =>
      updatePreference.mutateAsync({
        key: 'profileBackground',
        value: background ? { ...background, focus: getProfileBackgroundFocus(background) } : null,
      }),
    [updatePreference]
  );

  return {
    profileBackground: preferences?.profileBackground ?? null,
    setProfileBackground,
    isSaving: updatePreference.isPending,
  };
}
