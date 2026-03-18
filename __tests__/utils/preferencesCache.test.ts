import { QueryClient } from '@tanstack/react-query';

import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { seedHomeScreenListsCache } from '@/src/utils/preferencesCache';

describe('seedHomeScreenListsCache', () => {
  it('seeds the selected home screen lists without clobbering other preferences', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['preferences', 'user-1'], {
      ...DEFAULT_PREFERENCES,
      hideWatchedContent: true,
      defaultLaunchScreen: '/(tabs)/library',
    });

    seedHomeScreenListsCache(queryClient, 'user-1', [
      { id: 'top-rated-movies', type: 'tmdb', label: 'Top Rated' },
    ]);

    expect(queryClient.getQueryData(['preferences', 'user-1'])).toEqual({
      ...DEFAULT_PREFERENCES,
      hideWatchedContent: true,
      defaultLaunchScreen: '/(tabs)/library',
      homeScreenLists: [{ id: 'top-rated-movies', type: 'tmdb', label: 'Top Rated' }],
    });
  });

  it('does nothing when there are no home screen selections to seed', () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['preferences', 'user-1'], {
      ...DEFAULT_PREFERENCES,
      homeScreenLists: [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
    });

    seedHomeScreenListsCache(queryClient, 'user-1', []);

    expect(queryClient.getQueryData(['preferences', 'user-1'])).toEqual({
      ...DEFAULT_PREFERENCES,
      homeScreenLists: [{ id: 'trending-movies', type: 'tmdb', label: 'Trending Movies' }],
    });
  });
});
