import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// The jest setup freezes "now" at 2026-01-15.
const mockGetTVShowDetails = jest.fn();
const mockGetSeasonDetails = jest.fn();
const mockGetMovieDetails = jest.fn();

const mockListsState: { data: any[]; isLoading: boolean } = { data: [], isLoading: false };
const mockRemindersState: { data: any[]; isLoading: boolean } = { data: [], isLoading: false };

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'u1', isAnonymous: false } }),
}));
jest.mock('@/src/context/RegionProvider', () => ({
  useRegion: () => ({ region: 'US' }),
}));
jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockListsState,
}));
jest.mock('@/src/hooks/useReminders', () => ({
  useReminders: () => mockRemindersState,
}));
jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
    getSeasonDetails: (...args: unknown[]) => mockGetSeasonDetails(...args),
    getMovieDetails: (...args: unknown[]) => mockGetMovieDetails(...args),
  },
}));

import { useUpcomingReleases } from '@/src/hooks/useUpcomingReleases';
import { calendarEnrichmentCache } from '@/src/services/calendarEnrichment';

const movieItem = (id: number, releaseDate: string, title = `Movie ${id}`) => ({
  id,
  media_type: 'movie',
  title,
  poster_path: null,
  vote_average: 7,
  release_date: releaseDate,
  addedAt: 1,
});

const tvItem = (id: number, name = `Show ${id}`) => ({
  id,
  media_type: 'tv',
  title: name,
  name,
  poster_path: null,
  vote_average: 7,
  addedAt: 1,
});

const list = (id: string, items: any[]) => ({
  id,
  name: id,
  items: Object.fromEntries(items.map((item) => [`${item.media_type}-${item.id}`, item])),
  createdAt: 1,
});

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, Wrapper };
};

const isSettled = (state: ReturnType<typeof useUpcomingReleases>) =>
  !state.isLoading && !state.isEnrichmentFetching;

describe('useUpcomingReleases', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    calendarEnrichmentCache.resetForTests();
    await AsyncStorage.clear();
    mockListsState.data = [];
    mockRemindersState.data = [];
    mockGetMovieDetails.mockResolvedValue({ backdrop_path: null, release_dates: { results: [] } });
    mockGetTVShowDetails.mockResolvedValue({
      name: 'Show',
      status: 'Ended',
      backdrop_path: null,
      seasons: [],
      next_episode_to_air: null,
    });
    mockGetSeasonDetails.mockResolvedValue({ episodes: [] });
  });

  it('builds movie and episode releases, merging source lists and capping episodes per show', async () => {
    mockListsState.data = [
      list('watchlist', [movieItem(1, '2026-03-01'), tvItem(10)]),
      list('favorites', [movieItem(1, '2026-03-01')]),
      list('already-watched', [movieItem(2, '2026-04-01')]),
    ];
    mockGetTVShowDetails.mockResolvedValue({
      name: 'Show Ten',
      status: 'Returning Series',
      backdrop_path: '/ten.jpg',
      seasons: [{ season_number: 1 }, { season_number: 2 }],
      next_episode_to_air: {
        season_number: 2,
        episode_number: 1,
        name: 'E1',
        air_date: '2026-02-01',
      },
    });
    mockGetSeasonDetails.mockResolvedValue({
      episodes: Array.from({ length: 7 }, (_, index) => ({
        season_number: 2,
        episode_number: index + 1,
        name: `E${index + 1}`,
        air_date: `2026-02-0${index + 1}`,
      })),
    });

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.allReleases).toHaveLength(6));

    const movie = result.current.allReleases.find((release) => release.mediaType === 'movie');
    expect(movie).toEqual(
      expect.objectContaining({ id: 1, sourceLists: ['watchlist', 'favorites'] })
    );
    // "Already watched" is not a tracked list.
    expect(result.current.allReleases.some((release) => release.id === 2)).toBe(false);

    const episodes = result.current.allReleases.filter((release) => release.mediaType === 'tv');
    expect(episodes).toHaveLength(5);
    expect(episodes[0]).toEqual(
      expect.objectContaining({
        title: 'Show Ten',
        backdropPath: '/ten.jpg',
        uniqueKey: 'tv-10-s2-e1',
      })
    );
    expect(mockGetSeasonDetails).toHaveBeenCalledWith(10, 2);
  });

  it('skips movies released more than a year ago', async () => {
    mockListsState.data = [
      list('watchlist', [movieItem(1, '2020-01-01'), movieItem(2, '2025-06-01'), movieItem(3, '')]),
    ];

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: Wrapper });

    await waitFor(() => expect(mockGetMovieDetails).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(isSettled(result.current)).toBe(true));
    const requestedIds = mockGetMovieDetails.mock.calls.map(([id]) => id).sort();
    expect(requestedIds).toEqual([2, 3]);
  });

  it('renders from the device cache without refetching fresh titles', async () => {
    mockListsState.data = [list('watchlist', [tvItem(10)])];
    mockGetTVShowDetails.mockResolvedValue({
      name: 'Show Ten',
      status: 'Returning Series',
      backdrop_path: null,
      seasons: [{ season_number: 1 }],
      next_episode_to_air: null,
    });
    mockGetSeasonDetails.mockResolvedValue({
      episodes: [{ season_number: 1, episode_number: 3, name: 'E3', air_date: '2026-02-10' }],
    });

    const first = createWrapper();
    const firstRender = renderHook(() => useUpcomingReleases(), { wrapper: first.Wrapper });
    await waitFor(() => expect(firstRender.result.current.allReleases).toHaveLength(1));
    firstRender.unmount();
    await calendarEnrichmentCache.flush();

    // Simulate an app restart: new query client, empty memory, same storage.
    calendarEnrichmentCache.resetForTests();
    jest.clearAllMocks();

    const second = createWrapper();
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: second.Wrapper });
    await waitFor(() => expect(result.current.allReleases).toHaveLength(1));

    expect(result.current.allReleases[0].uniqueKey).toBe('tv-10-s1-e3');
    expect(result.current.isEnrichmentFetching).toBe(false);
    expect(mockGetTVShowDetails).not.toHaveBeenCalled();
    expect(mockGetSeasonDetails).not.toHaveBeenCalled();
  });

  it('keeps allReleases identity across unrelated re-renders', async () => {
    mockListsState.data = [list('watchlist', [movieItem(1, '2026-03-01')])];

    const { Wrapper } = createWrapper();
    const { result, rerender } = renderHook(() => useUpcomingReleases(), { wrapper: Wrapper });
    await waitFor(() => expect(isSettled(result.current)).toBe(true));

    const before = result.current.allReleases;
    await act(async () => {
      rerender({});
    });
    expect(result.current.allReleases).toBe(before);
  });

  it('merges reminders into matching releases and adds standalone ones', async () => {
    mockListsState.data = [list('watchlist', [movieItem(1, '2026-03-01')])];
    mockRemindersState.data = [
      { mediaId: 1, mediaType: 'movie', title: 'Movie 1', releaseDate: '2026-03-01', status: 'active' },
      { mediaId: 5, mediaType: 'movie', title: 'Reminder Only', posterPath: null, releaseDate: '2026-04-01', status: 'active' },
      { mediaId: 6, mediaType: 'movie', title: 'Cancelled', releaseDate: '2026-04-01', status: 'cancelled' },
    ];

    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useUpcomingReleases(), { wrapper: Wrapper });
    await waitFor(() => expect(isSettled(result.current)).toBe(true));

    expect(result.current.allReleases.map((release) => [release.id, release.isReminder])).toEqual([
      [1, true],
      [5, true],
    ]);
  });
});
