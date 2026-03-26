import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetAllWatchedShows = jest.fn();
const mockGetSeasonDetails = jest.fn();
const mockGetTVShowDetails = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: {
      uid: 'test-user-id',
      isAnonymous: false,
    },
  }),
}));

jest.mock('@/src/services/EpisodeTrackingService', () => ({
  episodeTrackingService: {
    getAllWatchedShows: (...args: unknown[]) => mockGetAllWatchedShows(...args),
  },
}));

jest.mock('@/src/api/tmdb', () => ({
  tmdbApi: {
    getTVShowDetails: (...args: unknown[]) => mockGetTVShowDetails(...args),
    getSeasonDetails: (...args: unknown[]) => mockGetSeasonDetails(...args),
  },
}));

import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function buildShowDetails(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Mock Show',
    original_name: 'Mock Show',
    overview: '',
    poster_path: '/tmdb-show.jpg',
    backdrop_path: '/backdrop.jpg',
    first_air_date: '2026-01-01',
    vote_average: 8,
    vote_count: 100,
    popularity: 1,
    genre_ids: [],
    original_language: 'en',
    number_of_seasons: 1,
    number_of_episodes: 1,
    genres: [],
    status: 'Returning Series',
    seasons: [],
    episode_run_time: [30],
    last_air_date: '2026-03-01',
    production_countries: [],
    production_companies: [],
    content_ratings: { results: [] },
    created_by: [],
    next_episode_to_air: null,
    last_episode_to_air: null,
    ...overrides,
  } as any;
}

function buildSeasonDetails(episodes: Array<Record<string, unknown>>) {
  return {
    episodes,
  } as any;
}

describe('useCurrentlyWatching', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date('2026-03-09T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('treats older gaps as caught up when the furthest watched episode matches the latest aired frontier', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Latest Pace Show',
          posterPath: null,
          lastUpdated: 5000,
        },
        episodes: {
          '1_1': {
            episodeId: 101,
            tvShowId: 700,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1000,
            episodeName: 'Pilot',
            episodeAirDate: '2026-01-01',
          },
          '2_3': {
            episodeId: 203,
            tvShowId: 700,
            seasonNumber: 2,
            episodeNumber: 3,
            watchedAt: 2000,
            episodeName: 'Episode 3',
            episodeAirDate: '2026-03-08',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 700,
        poster_path: '/tmdb-latest-pace.jpg',
        seasons: [
          { season_number: 1, episode_count: 10, air_date: '2026-01-01' },
          { season_number: 2, episode_count: 10, air_date: '2026-02-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 3,
          air_date: '2026-03-08',
        },
        next_episode_to_air: {
          season_number: 2,
          episode_number: 4,
          air_date: '2026-03-16',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        {
          season_number: 2,
          episode_number: 1,
          name: 'Season 2 Premiere',
          air_date: '2026-02-22',
        },
        {
          season_number: 2,
          episode_number: 2,
          name: 'Episode 2',
          air_date: '2026-03-01',
        },
        {
          season_number: 2,
          episode_number: 3,
          name: 'Episode 3',
          air_date: '2026-03-08',
        },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toHaveLength(1);
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 700,
        tvShowName: 'Latest Pace Show',
        posterPath: '/tmdb-latest-pace.jpg',
        percentage: 100,
        timeRemaining: 0,
        nextEpisode: null,
        lastWatchedEpisode: {
          season: 2,
          episode: 3,
          title: 'Episode 3',
        },
      })
    );
  });

  it('computes next episode and time remaining from the aired frontier', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Behind Show',
          posterPath: null,
          lastUpdated: 8000,
        },
        episodes: {
          '1_3': {
            episodeId: 103,
            tvShowId: 701,
            seasonNumber: 1,
            episodeNumber: 3,
            watchedAt: 3000,
            episodeName: 'Episode 3',
            episodeAirDate: '2026-03-03',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 701,
        poster_path: '/tmdb-behind.jpg',
        status: 'Ended',
        seasons: [{ season_number: 1, episode_count: 6, air_date: '2026-02-01' }],
        last_episode_to_air: {
          season_number: 1,
          episode_number: 5,
          air_date: '2026-03-05',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 1, episode_number: 1, name: 'Episode 1', air_date: '2026-03-01' },
        { season_number: 1, episode_number: 2, name: 'Episode 2', air_date: '2026-03-02' },
        { season_number: 1, episode_number: 3, name: 'Episode 3', air_date: '2026-03-03' },
        { season_number: 1, episode_number: 4, name: 'Episode 4', air_date: '2026-03-04' },
        { season_number: 1, episode_number: 5, name: 'Episode 5', air_date: '2026-03-05' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data[0]?.nextEpisode?.airDate).toBe('2026-03-04');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 701,
        posterPath: '/tmdb-behind.jpg',
        percentage: 60,
        timeRemaining: 60,
        nextEpisode: {
          season: 1,
          episode: 4,
          title: 'Episode 4',
          airDate: '2026-03-04',
        },
      })
    );
  });

  it('hides fully completed ended shows from the list', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Finished Show',
          posterPath: '/stored-poster.jpg',
          lastUpdated: 9000,
        },
        episodes: {
          '1_5': {
            episodeId: 105,
            tvShowId: 702,
            seasonNumber: 1,
            episodeNumber: 5,
            watchedAt: 5000,
            episodeName: 'Finale',
            episodeAirDate: '2026-03-05',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 702,
        poster_path: null,
        status: 'Ended',
        seasons: [{ season_number: 1, episode_count: 5, air_date: '2026-02-01' }],
        last_episode_to_air: {
          season_number: 1,
          episode_number: 5,
          air_date: '2026-03-05',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 1, episode_number: 5, name: 'Finale', air_date: '2026-03-05' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });
});
