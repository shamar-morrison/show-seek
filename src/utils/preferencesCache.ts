import { QueryClient } from '@tanstack/react-query';

import { DEFAULT_PREFERENCES, type HomeScreenListItem, type UserPreferences } from '@/src/types/preferences';

const getPreferencesQueryKey = (userId: string) => ['preferences', userId] as const;

export function seedHomeScreenListsCache(
  queryClient: QueryClient,
  userId: string | null | undefined,
  homeScreenLists: HomeScreenListItem[]
): void {
  if (!userId || homeScreenLists.length === 0) {
    return;
  }

  queryClient.setQueryData<UserPreferences>(getPreferencesQueryKey(userId), (current) => ({
    ...(current ?? DEFAULT_PREFERENCES),
    homeScreenLists: homeScreenLists.map((item) => ({ ...item })),
  }));
}
