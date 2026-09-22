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
import i18n from '@/src/i18n';

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

function buildWatchedRange(
  tvShowId: number,
  seasonNumber: number,
  startEp: number,
  endEp: number
): Record<string, any> {
  const result: Record<string, any> = {};
  for (let ep = startEp; ep <= endEp; ep++) {
    result[`${seasonNumber}_${ep}`] = {
      episodeId: seasonNumber * 1000 + ep,
      tvShowId,
      seasonNumber,
      episodeNumber: ep,
      watchedAt: 1000 + ep,
      episodeName: `Episode ${ep}`,
      episodeAirDate: '2026-01-01',
    };
  }
  return result;
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

  it('selects the first unwatched aired episode when there are gaps before the furthest watched episode', async () => {
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
        percentage: 10,
        timeRemaining: 330,
        showEnded: false,
        nextEpisode: {
          kind: 'unwatched',
          season: 1,
          episode: 2,
          title: i18n.t('media.episodeNumber', { number: 2 }),
        },
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
          '1_1': {
            episodeId: 101,
            tvShowId: 701,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1000,
            episodeName: 'Episode 1',
            episodeAirDate: '2026-03-01',
          },
          '1_2': {
            episodeId: 102,
            tvShowId: 701,
            seasonNumber: 1,
            episodeNumber: 2,
            watchedAt: 2000,
            episodeName: 'Episode 2',
            episodeAirDate: '2026-03-02',
          },
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
      expect(result.current.data[0]?.nextEpisode?.kind).toBe('unwatched');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 701,
        posterPath: '/tmdb-behind.jpg',
        percentage: 50,
        timeRemaining: 60,
        nextEpisode: {
          kind: 'unwatched',
          season: 1,
          episode: 4,
          title: 'Episode 4',
        },
      })
    );
  });

  it('uses the localized episode label when the fetched next episode name is missing', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Localized Fallback Show',
          posterPath: null,
          lastUpdated: 8200,
        },
        episodes: {
          '1_1': {
            episodeId: 201,
            tvShowId: 703,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 3000,
            episodeName: 'Pilot',
            episodeAirDate: '2026-03-01',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 703,
        poster_path: '/tmdb-localized.jpg',
        seasons: [{ season_number: 1, episode_count: 4, air_date: '2026-03-01' }],
        last_episode_to_air: {
          season_number: 1,
          episode_number: 2,
          air_date: '2026-03-02',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 1, episode_number: 1, name: 'Pilot', air_date: '2026-03-01' },
        { season_number: 1, episode_number: 2, name: '', air_date: '2026-03-02' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data[0]?.nextEpisode?.kind).toBe('unwatched');
    });

    expect(result.current.data[0]?.nextEpisode).toEqual({
      kind: 'unwatched',
      season: 1,
      episode: 2,
      title: i18n.t('media.episodeNumber', { number: 2 }),
    });
  });

  it('derives the aired frontier from fallback season details when last_episode_to_air is missing', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Partial Airing Show',
          posterPath: null,
          lastUpdated: 9100,
        },
        episodes: {
          '1_1': { episodeId: 101, tvShowId: 704, seasonNumber: 1, episodeNumber: 1, watchedAt: 1000, episodeName: 'Episode 1', episodeAirDate: '2026-01-01' },
          '1_2': { episodeId: 102, tvShowId: 704, seasonNumber: 1, episodeNumber: 2, watchedAt: 1500, episodeName: 'Episode 2', episodeAirDate: '2026-01-08' },
          '1_3': { episodeId: 103, tvShowId: 704, seasonNumber: 1, episodeNumber: 3, watchedAt: 2000, episodeName: 'Episode 3', episodeAirDate: '2026-01-15' },
          '1_4': { episodeId: 104, tvShowId: 704, seasonNumber: 1, episodeNumber: 4, watchedAt: 2500, episodeName: 'Episode 4', episodeAirDate: '2026-01-22' },
          '1_5': { episodeId: 105, tvShowId: 704, seasonNumber: 1, episodeNumber: 5, watchedAt: 3000, episodeName: 'Episode 5', episodeAirDate: '2026-01-29' },
          '1_6': { episodeId: 106, tvShowId: 704, seasonNumber: 1, episodeNumber: 6, watchedAt: 3500, episodeName: 'Episode 6', episodeAirDate: '2026-02-05' },
          '1_7': { episodeId: 107, tvShowId: 704, seasonNumber: 1, episodeNumber: 7, watchedAt: 4000, episodeName: 'Episode 7', episodeAirDate: '2026-02-12' },
          '1_8': { episodeId: 108, tvShowId: 704, seasonNumber: 1, episodeNumber: 8, watchedAt: 4500, episodeName: 'Episode 8', episodeAirDate: '2026-02-19' },
          '1_9': { episodeId: 109, tvShowId: 704, seasonNumber: 1, episodeNumber: 9, watchedAt: 5000, episodeName: 'Episode 9', episodeAirDate: '2026-02-26' },
          '1_10': {
            episodeId: 110,
            tvShowId: 704,
            seasonNumber: 1,
            episodeNumber: 10,
            watchedAt: 6000,
            episodeName: 'Season 1 Finale',
            episodeAirDate: '2026-02-20',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 704,
        poster_path: '/tmdb-partial.jpg',
        seasons: [
          { season_number: 1, episode_count: 10, air_date: '2026-01-01' },
          { season_number: 2, episode_count: 10, air_date: '2026-03-01' },
        ],
        last_episode_to_air: null,
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 2, episode_number: 1, name: 'Season 2 Premiere', air_date: '2026-03-01' },
        { season_number: 2, episode_number: 2, name: 'Episode 2', air_date: '2026-03-08' },
        { season_number: 2, episode_number: 3, name: 'Episode 3', air_date: '2026-03-15' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data[0]?.nextEpisode?.kind).toBe('unwatched');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 704,
        posterPath: '/tmdb-partial.jpg',
        percentage: 50,
        timeRemaining: 60,
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 1,
          title: 'Season 2 Premiere',
        },
      })
    );
    expect(mockGetSeasonDetails).toHaveBeenCalledWith(704, 2);
  });

  it('uses the full known total when a watched episode is ahead of the aired frontier', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Watched Ahead Show',
          posterPath: null,
          lastUpdated: 9200,
        },
        episodes: {
          '1_1': {
            episodeId: 301,
            tvShowId: 705,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 3000,
            episodeName: 'Episode 1',
            episodeAirDate: '2026-03-01',
          },
          '1_2': {
            episodeId: 302,
            tvShowId: 705,
            seasonNumber: 1,
            episodeNumber: 2,
            watchedAt: 4000,
            episodeName: 'Episode 2',
            episodeAirDate: '2026-03-02',
          },
          '1_3': {
            episodeId: 303,
            tvShowId: 705,
            seasonNumber: 1,
            episodeNumber: 3,
            watchedAt: 5000,
            episodeName: 'Episode 3',
            episodeAirDate: '2026-03-03',
          },
          '1_4': {
            episodeId: 304,
            tvShowId: 705,
            seasonNumber: 1,
            episodeNumber: 4,
            watchedAt: 6000,
            episodeName: 'Episode 4',
            episodeAirDate: '2026-03-10',
          },
          '1_5': {
            episodeId: 305,
            tvShowId: 705,
            seasonNumber: 1,
            episodeNumber: 5,
            watchedAt: 7000,
            episodeName: 'Episode 5',
            episodeAirDate: '2026-03-17',
          },
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 705,
        poster_path: '/tmdb-ahead.jpg',
        seasons: [{ season_number: 1, episode_count: 6, air_date: '2026-03-01' }],
        last_episode_to_air: {
          season_number: 1,
          episode_number: 3,
          air_date: '2026-03-03',
        },
        next_episode_to_air: {
          season_number: 1,
          episode_number: 4,
          air_date: '2026-03-10',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 1, episode_number: 4, name: 'Episode 4', air_date: '2026-03-10' },
        { season_number: 1, episode_number: 5, name: 'Episode 5', air_date: '2026-03-17' },
        { season_number: 1, episode_number: 6, name: 'Episode 6', air_date: '2026-03-24' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data[0]?.nextEpisode?.kind).toBe('upcoming');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 705,
        posterPath: '/tmdb-ahead.jpg',
        percentage: 83,
        timeRemaining: 0,
        nextEpisode: {
          kind: 'upcoming',
          season: 1,
          episode: 6,
          title: 'Episode 6',
        },
      })
    );
  });

  it('includes fully completed ended shows in the list with kind complete', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Finished Show',
          posterPath: '/stored-poster.jpg',
          lastUpdated: 9000,
        },
        episodes: {
          '1_1': {
            episodeId: 101,
            tvShowId: 702,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1000,
            episodeName: 'Episode 1',
            episodeAirDate: '2026-02-01',
          },
          '1_2': {
            episodeId: 102,
            tvShowId: 702,
            seasonNumber: 1,
            episodeNumber: 2,
            watchedAt: 2000,
            episodeName: 'Episode 2',
            episodeAirDate: '2026-02-08',
          },
          '1_3': {
            episodeId: 103,
            tvShowId: 702,
            seasonNumber: 1,
            episodeNumber: 3,
            watchedAt: 3000,
            episodeName: 'Episode 3',
            episodeAirDate: '2026-02-15',
          },
          '1_4': {
            episodeId: 104,
            tvShowId: 702,
            seasonNumber: 1,
            episodeNumber: 4,
            watchedAt: 4000,
            episodeName: 'Episode 4',
            episodeAirDate: '2026-02-22',
          },
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
      expect(result.current.data).toHaveLength(1);
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 702,
        tvShowName: 'Finished Show',
        percentage: 100,
        timeRemaining: 0,
        showEnded: true,
        nextEpisode: {
          kind: 'complete',
        },
        lastWatchedEpisode: {
          season: 1,
          episode: 5,
          title: 'Finale',
        },
      })
    );
  });

  it('handles caught-up-but-still-airing shows with percentage < 100% and upcoming nextEpisode', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Ongoing Airing Show',
          posterPath: '/stored-poster.jpg',
          lastUpdated: 9500,
        },
        episodes: {
          '1_1': {
            episodeId: 401,
            tvShowId: 706,
            seasonNumber: 1,
            episodeNumber: 1,
            watchedAt: 1000,
            episodeName: 'Episode 1',
            episodeAirDate: '2026-03-01',
          },
          '1_2': {
            episodeId: 402,
            tvShowId: 706,
            seasonNumber: 1,
            episodeNumber: 2,
            watchedAt: 2000,
            episodeName: 'Episode 2',
            episodeAirDate: '2026-03-02',
          },
          '1_3': {
            episodeId: 403,
            tvShowId: 706,
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
        id: 706,
        poster_path: '/tmdb-ongoing.jpg',
        status: 'Returning Series',
        seasons: [{ season_number: 1, episode_count: 6, air_date: '2026-03-01' }],
        last_episode_to_air: {
          season_number: 1,
          episode_number: 3,
          air_date: '2026-03-03',
        },
        next_episode_to_air: {
          season_number: 1,
          episode_number: 4,
          name: 'The Reckoning',
          air_date: '2026-03-15',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 1, episode_number: 4, name: 'The Reckoning', air_date: '2026-03-15' },
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
        tvShowId: 706,
        tvShowName: 'Ongoing Airing Show',
        // 3 watched aired episodes out of 6 total known = 50%, NOT 100%
        percentage: 50,
        timeRemaining: 0,
        showEnded: false,
        nextEpisode: {
          kind: 'upcoming',
          season: 1,
          episode: 4,
          title: 'The Reckoning',
        },
        lastWatchedEpisode: {
          season: 1,
          episode: 3,
          title: 'Episode 3',
        },
      })
    );
  });

  it('handles fully-watched show with continuous episode numbering (HxH bug)', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Hunter x Hunter',
          posterPath: '/hxh.jpg',
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(46298, 1, 1, 62),
          ...buildWatchedRange(46298, 2, 63, 136),
          ...buildWatchedRange(46298, 3, 137, 148),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 46298,
        name: 'Hunter x Hunter',
        status: 'Ended',
        number_of_episodes: 148,
        number_of_seasons: 3,
        seasons: [
          { season_number: 1, episode_count: 62, air_date: '2011-10-02' },
          { season_number: 2, episode_count: 74, air_date: '2012-12-15' },
          { season_number: 3, episode_count: 12, air_date: '2014-07-07' },
        ],
        last_episode_to_air: {
          season_number: 3,
          episode_number: 148,
          air_date: '2014-09-24',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 3, episode_number: 148, name: 'Finale', air_date: '2014-09-24' },
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
        tvShowId: 46298,
        percentage: 100,
        timeRemaining: 0,
        showEnded: true,
        nextEpisode: { kind: 'complete' },
      })
    );
  });

  it('handles partially-watched mid-continuous-season show', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Hunter x Hunter',
          posterPath: '/hxh.jpg',
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(46298, 1, 1, 62),
          ...buildWatchedRange(46298, 2, 63, 72),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 46298,
        status: 'Ended',
        seasons: [
          { season_number: 1, episode_count: 62, air_date: '2011-10-02' },
          { season_number: 2, episode_count: 74, air_date: '2012-12-15' },
          { season_number: 3, episode_count: 12, air_date: '2014-07-07' },
        ],
        last_episode_to_air: {
          season_number: 3,
          episode_number: 148,
          air_date: '2014-09-24',
        },
      })
    );
    const s2Episodes = [];
    for (let ep = 63; ep <= 136; ep++) {
      s2Episodes.push({
        season_number: 2,
        episode_number: ep,
        name: ep === 73 ? 'Insane x Inquest' : `Episode ${ep}`,
        air_date: '2013-03-10',
      });
    }
    mockGetSeasonDetails.mockResolvedValue(buildSeasonDetails(s2Episodes));

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect((result.current.data[0]?.nextEpisode as any)?.title).toBe('Insane x Inquest');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 46298,
        // 72 watched out of 148 total = 49%
        percentage: 49,
        // 76 unwatched aired episodes * 30 min = 2280 min
        timeRemaining: 2280,
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 73,
          title: 'Insane x Inquest',
        },
      })
    );
  });

  it('handles zero-watched freshly-started continuous season with season-details fetch', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Hunter x Hunter',
          posterPath: '/hxh.jpg',
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(46298, 1, 1, 62),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 46298,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 62, air_date: '2011-10-02' },
          { season_number: 2, episode_count: 74, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 65,
          air_date: '2026-03-05',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 2, episode_number: 63, name: 'S2 Premiere', air_date: '2026-03-01' },
        { season_number: 2, episode_number: 64, name: 'S2 Episode 2', air_date: '2026-03-03' },
        { season_number: 2, episode_number: 65, name: 'S2 Episode 3', air_date: '2026-03-05' },
        { season_number: 2, episode_number: 66, name: 'S2 Episode 4', air_date: '2026-03-15' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect((result.current.data[0]?.nextEpisode as any)?.title).toBe('S2 Premiere');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 46298,
        // 62 watched out of 136 total = 46%
        percentage: 46,
        // 3 unwatched aired episodes * 30 min = 90 min
        timeRemaining: 90,
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 63,
          title: 'S2 Premiere',
        },
      })
    );
  });

  it('handles continuously-numbered show with still-airing final season capping correctly', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Hunter x Hunter',
          posterPath: '/hxh.jpg',
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(46298, 1, 1, 62),
          ...buildWatchedRange(46298, 2, 63, 136),
          // User watched 2 of the 4 aired episodes in S3
          ...buildWatchedRange(46298, 3, 137, 138),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 46298,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 62, air_date: '2011-10-02' },
          { season_number: 2, episode_count: 74, air_date: '2012-12-15' },
          { season_number: 3, episode_count: 12, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 3,
          episode_number: 140,
          air_date: '2026-03-08',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 3, episode_number: 137, name: 'S3E1', air_date: '2026-03-01' },
        { season_number: 3, episode_number: 138, name: 'S3E2', air_date: '2026-03-03' },
        { season_number: 3, episode_number: 139, name: 'S3E3', air_date: '2026-03-05' },
        { season_number: 3, episode_number: 140, name: 'S3E4', air_date: '2026-03-08' },
        { season_number: 3, episode_number: 141, name: 'S3E5', air_date: '2026-03-15' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect((result.current.data[0]?.nextEpisode as any)?.title).toBe('S3E3');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 46298,
        // 138 watched out of 148 total = 93%
        percentage: 93,
        // 2 unwatched aired episodes (139, 140) * 30 min = 60 min
        timeRemaining: 60,
        nextEpisode: {
          kind: 'unwatched',
          season: 3,
          episode: 139,
          title: 'S3E3',
        },
      })
    );
  });

  it('handles standard 1-based show as regression check', async () => {
    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Standard Show',
          posterPath: '/standard.jpg',
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(800, 1, 1, 10),
          ...buildWatchedRange(800, 2, 1, 2),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 800,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 10, air_date: '2025-01-01' },
          { season_number: 2, episode_count: 10, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 5,
          air_date: '2026-03-08',
        },
      })
    );
    mockGetSeasonDetails.mockResolvedValue(
      buildSeasonDetails([
        { season_number: 2, episode_number: 1, name: 'S2E1', air_date: '2026-03-01' },
        { season_number: 2, episode_number: 2, name: 'S2E2', air_date: '2026-03-02' },
        { season_number: 2, episode_number: 3, name: 'S2E3', air_date: '2026-03-03' },
        { season_number: 2, episode_number: 4, name: 'S2E4', air_date: '2026-03-05' },
        { season_number: 2, episode_number: 5, name: 'S2E5', air_date: '2026-03-08' },
        { season_number: 2, episode_number: 6, name: 'S2E6', air_date: '2026-03-15' },
      ])
    );

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect((result.current.data[0]?.nextEpisode as any)?.title).toBe('S2E3');
    });

    expect(result.current.data[0]).toEqual(
      expect.objectContaining({
        tvShowId: 800,
        // 12 watched out of 20 total = 60%
        percentage: 60,
        // 3 unwatched aired episodes (3, 4, 5) * 30 min = 90 min
        timeRemaining: 90,
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 3,
          title: 'S2E3',
        },
      })
    );
  });

  it('handles fallback heuristic for freshly-started continuous season when season-details query is pending', async () => {
    let resolveSeasonDetails!: (value: any) => void;
    const pendingSeasonDetailsPromise = new Promise((resolve) => {
      resolveSeasonDetails = resolve;
    });

    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Continuous Fresh Season Show',
          posterPath: null,
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(714, 1, 1, 62),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 714,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 62, air_date: '2020-01-01' },
          { season_number: 2, episode_count: 74, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 65,
          air_date: '2026-03-05',
        },
      })
    );
    mockGetSeasonDetails.mockImplementation(() => pendingSeasonDetailsPromise);

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    // 1 & 2: While season details query is still pending, verify fallback heuristic
    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    const pendingResult = result.current.data[0];
    expect(pendingResult.nextEpisode).toEqual({
      kind: 'unwatched',
      season: 2,
      episode: 63,
      title: i18n.t('media.episodeNumber', { number: 63 }),
    });

    // 3: Once season-details query resolves, verify result stays consistent (S2E63 with real title, no flicker)
    act(() => {
      resolveSeasonDetails(
        buildSeasonDetails([
          { season_number: 2, episode_number: 63, name: 'S2 Ep 63 Real Title', air_date: '2026-03-01' },
          { season_number: 2, episode_number: 64, name: 'S2 Ep 64 Real Title', air_date: '2026-03-03' },
          { season_number: 2, episode_number: 65, name: 'S2 Ep 65 Real Title', air_date: '2026-03-05' },
        ])
      );
    });

    await waitFor(() => {
      expect(result.current.data[0].nextEpisode).toEqual({
        kind: 'unwatched',
        season: 2,
        episode: 63,
        title: 'S2 Ep 63 Real Title',
      });
    });
  });

  it('treats standard show with later season episode exceeding prior count as standard 1-based numbering when season details pending', async () => {
    let resolveSeasonDetails!: (value: any) => void;
    const pendingSeasonDetailsPromise = new Promise((resolve) => {
      resolveSeasonDetails = resolve;
    });

    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Standard Show Later Season',
          posterPath: null,
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(805, 1, 1, 5),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 805,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 5, air_date: '2025-01-01' },
          { season_number: 2, episode_count: 20, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 6,
          air_date: '2026-03-08',
        },
      })
    );
    mockGetSeasonDetails.mockImplementation(() => pendingSeasonDetailsPromise);

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    const pendingResult = result.current.data[0];
    expect(pendingResult).toEqual(
      expect.objectContaining({
        tvShowId: 805,
        percentage: 20,
        timeRemaining: 180,
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 1,
          title: i18n.t('media.episodeNumber', { number: 1 }),
        },
      })
    );

    act(() => {
      resolveSeasonDetails(
        buildSeasonDetails([
          { season_number: 2, episode_number: 1, name: 'S2E1 Real Title', air_date: '2026-03-01' },
          { season_number: 2, episode_number: 2, name: 'S2E2', air_date: '2026-03-02' },
          { season_number: 2, episode_number: 3, name: 'S2E3', air_date: '2026-03-03' },
          { season_number: 2, episode_number: 4, name: 'S2E4', air_date: '2026-03-04' },
          { season_number: 2, episode_number: 5, name: 'S2E5', air_date: '2026-03-05' },
          { season_number: 2, episode_number: 6, name: 'S2E6', air_date: '2026-03-08' },
        ])
      );
    });

    await waitFor(() => {
      expect(result.current.data[0].nextEpisode).toEqual({
        kind: 'unwatched',
        season: 2,
        episode: 1,
        title: 'S2E1 Real Title',
      });
    });
  });

  it('evaluates pending window behavior for standard show with large season count (S1=30, S2=40, S2E35)', async () => {
    let resolveSeasonDetails!: (value: any) => void;
    const pendingSeasonDetailsPromise = new Promise((resolve) => {
      resolveSeasonDetails = resolve;
    });

    mockGetAllWatchedShows.mockResolvedValue([
      {
        metadata: {
          tvShowName: 'Large Standard Show',
          posterPath: null,
          lastUpdated: 5000,
        },
        episodes: {
          ...buildWatchedRange(806, 1, 1, 30),
        },
      },
    ]);
    mockGetTVShowDetails.mockResolvedValue(
      buildShowDetails({
        id: 806,
        status: 'Returning Series',
        seasons: [
          { season_number: 1, episode_count: 30, air_date: '2024-01-01' },
          { season_number: 2, episode_count: 40, air_date: '2026-03-01' },
        ],
        last_episode_to_air: {
          season_number: 2,
          episode_number: 35,
          air_date: '2026-03-08',
        },
      })
    );
    mockGetSeasonDetails.mockImplementation(() => pendingSeasonDetailsPromise);

    const client = createQueryClient();
    const { result } = renderHook(() => useCurrentlyWatching(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1);
    });

    const pendingResult = result.current.data[0];
    // During the pending window before S2 details resolve:
    // Fallback heuristic flags continuous (35 > 30 && 30 >= 30), guessing S2E31 instead of S2E1
    expect(pendingResult).toEqual(
      expect.objectContaining({
        tvShowId: 806,
        percentage: 43,
        timeRemaining: 150, // 5 unwatched (31-35) * 30 min
        nextEpisode: {
          kind: 'unwatched',
          season: 2,
          episode: 31,
          title: i18n.t('media.episodeNumber', { number: 31 }),
        },
      })
    );

    // Resolve season details with real TMDB 1-based episodes 1..35
    const realEpisodes: Array<Record<string, unknown>> = [];
    for (let ep = 1; ep <= 35; ep++) {
      realEpisodes.push({
        season_number: 2,
        episode_number: ep,
        name: ep === 1 ? 'S2E1 Real Title' : `Episode ${ep}`,
        air_date: '2026-03-08',
      });
    }

    act(() => {
      resolveSeasonDetails(buildSeasonDetails(realEpisodes));
    });

    // Once resolved, Signal 1 overrides: self-corrects to S2E1 with full 35 unwatched episodes (1050 min)
    await waitFor(() => {
      expect(result.current.data[0]).toEqual(
        expect.objectContaining({
          tvShowId: 806,
          percentage: 43,
          timeRemaining: 1050, // 35 unwatched (1-35) * 30 min
          nextEpisode: {
            kind: 'unwatched',
            season: 2,
            episode: 1,
            title: 'S2E1 Real Title',
          },
        })
      );
    });
  });
});
