import React from 'react';
import { act, render } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetTVShowDetails = jest.fn();
const mockGetSeasonDetails = jest.fn();

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: true, isLoading: false }),
}));
jest.mock('@/src/context/AccentColorProvider', () => ({
  useAccentColor: () => ({ accentColor: '#ff0000' }),
}));
jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1', isAnonymous: false } }),
}));
jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => ({ region: 'US' }),
}));

// One selected custom list of 3 TV shows, plus an unselected watchlist movie
// that keeps `hasReleases` true so the pre-fix gate reached the *filtered*
// empty state rather than the whole-library empty state.
const mockLists = [
  {
    id: 'custom-list-1',
    name: 'My Shows',
    items: {
      'tv-101': { id: 101, media_type: 'tv', name: 'Show A', title: 'Show A', poster_path: null },
      'tv-102': { id: 102, media_type: 'tv', name: 'Show B', title: 'Show B', poster_path: null },
      'tv-103': { id: 103, media_type: 'tv', name: 'Show C', title: 'Show C', poster_path: null },
    },
  },
  {
    id: 'watchlist',
    name: 'Watchlist',
    items: {
      'movie-201': {
        id: 201,
        media_type: 'movie',
        title: 'Some Movie',
        poster_path: null,
        release_date: '2026-12-01',
      },
    },
  },
];

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => ({ data: mockLists, isLoading: false }),
}));
jest.mock('@/src/hooks/useReminders', () => ({
  useReminders: () => ({ data: [], isLoading: false }),
}));
jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
    getSeasonDetails: (...args: unknown[]) => mockGetSeasonDetails(...args),
  },
  getImageUrl: () => null,
  TMDB_IMAGE_SIZES: { poster: {}, backdrop: {} },
}));
jest.mock('@/src/utils/rateLimitedQuery', () => ({
  createRateLimitedQueryFn: (fn: () => Promise<unknown>) => fn,
}));

jest.mock('@/src/components/calendar/ReleaseCalendar', () => ({
  ReleaseCalendar: () => {
    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, { testID: 'release-calendar' });
  },
}));
jest.mock('@/src/components/calendar/ReleaseCalendarSkeleton', () => ({
  ReleaseCalendarSkeleton: () => {
    const ReactLocal = require('react');
    const { View } = require('react-native');
    return ReactLocal.createElement(View, { testID: 'calendar-loading' });
  },
}));
jest.mock('@/src/components/calendar/CalendarSortModal', () => ({
  CalendarSortModal: () => null,
}));
jest.mock('@/src/components/calendar/CalendarSourceFilterModal', () => ({
  CalendarSourceFilterModal: () => null,
}));
jest.mock('@/src/components/ui/InlineUpdatingIndicator', () => ({
  InlineUpdatingIndicator: ({ message }: { message: string }) => {
    const ReactLocal = require('react');
    const { Text } = require('react-native');
    return ReactLocal.createElement(Text, null, message);
  },
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
  useNavigation: () => ({ setOptions: jest.fn() }),
}));

import CalendarScreen from '@/app/(tabs)/home/calendar';

const SHOW_IDS = [101, 102, 103];
const SEASON_KEY = (id: number) => ['tv', id, 'season', 1, 'calendar'];
const DETAILS_KEY = (id: number) => ['tv', id, 'calendar-enrichment'];

const buildStaleDetails = (id: number) => ({
  id,
  name: `Show ${id}`,
  poster_path: null,
  backdrop_path: null,
  status: 'Returning Series',
  seasons: [{ season_number: 1, episode_count: 8, air_date: '2020-01-01' }],
  next_episode_to_air: null,
  genres: [],
});

// No future episodes in the stale cache: by itself it yields zero releases.
const STALE_SEASON = {
  episodes: [{ season_number: 1, episode_number: 1, name: 'Old', air_date: '2020-01-01' }],
};

describe('CalendarScreen enrichment background-refetch gate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['custom-list-1']));
    // Keep the in-flight refetch pending for the whole assertion window.
    mockGetTVShowDetails.mockImplementation(() => new Promise(() => {}));
    mockGetSeasonDetails.mockImplementation(() => new Promise(() => {}));
  });

  it('shows the skeleton (not the filtered-empty state) while a stale enrichment query is fetching', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    // Seed a stale-but-cached (status: success) details + season result.
    SHOW_IDS.forEach((id) => {
      queryClient.setQueryData(DETAILS_KEY(id), buildStaleDetails(id));
      queryClient.setQueryData(SEASON_KEY(id), STALE_SEASON);
    });

    // Mark them stale so observers refetch on mount. No observers exist yet, so
    // this only flips them to stale; the refetch starts when the screen mounts.
    await act(async () => {
      await Promise.all(
        SHOW_IDS.map((id) => queryClient.invalidateQueries({ queryKey: SEASON_KEY(id) }))
      );
      await Promise.all(
        SHOW_IDS.map((id) => queryClient.invalidateQueries({ queryKey: DETAILS_KEY(id) }))
      );
    });

    const screen = render(
      <QueryClientProvider client={queryClient}>
        <CalendarScreen />
      </QueryClientProvider>
    );

    const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    await flush();
    await flush();

    // Prove the constructed state matches the real bug: cached data (status
    // 'success' => isLoading === false) with a refetch in flight (fetching).
    const seasonState = queryClient.getQueryCache().find({ queryKey: SEASON_KEY(101) })?.state;
    expect(seasonState?.status).toBe('success');
    expect(seasonState?.fetchStatus).toBe('fetching');

    // The gate must treat "revalidating" as not settled and keep the skeleton.
    expect(screen.getByTestId('calendar-loading')).toBeTruthy();
    expect(screen.queryByText('No releases match these filters')).toBeNull();
    expect(screen.queryByText('Clear Filters')).toBeNull();
    expect(screen.queryByTestId('release-calendar')).toBeNull();
  });
});
