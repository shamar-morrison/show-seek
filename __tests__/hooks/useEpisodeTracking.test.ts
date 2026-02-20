import type { Episode } from '@/src/api/tmdb';
import { READ_QUERY_CACHE_WINDOWS } from '@/src/config/readOptimization';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';
import { useQuery } from '@tanstack/react-query';

const mockInvalidateQueries = jest.fn();

// Mock dependencies
jest.mock('@/src/services/EpisodeTrackingService', () => ({
  episodeTrackingService: {
    markEpisodeWatched: jest.fn().mockResolvedValue(undefined),
    markEpisodeUnwatched: jest.fn().mockResolvedValue(undefined),
    markAllEpisodesWatched: jest.fn().mockResolvedValue(undefined),
    markAllEpisodesUnwatched: jest.fn().mockResolvedValue(undefined),
    getShowTracking: jest.fn().mockResolvedValue(null),
    isEpisodeWatched: jest.fn().mockReturnValue(false),
    calculateSeasonProgress: jest.fn().mockReturnValue({ watched: 0, total: 10, percentage: 0 }),
    calculateShowProgress: jest.fn().mockReturnValue({ watched: 0, total: 50, percentage: 0 }),
  },
}));

jest.mock('@/src/services/ListService', () => ({
  listService: {
    addToList: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-123' },
  },
  db: {},
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(() => ({
    getQueryData: jest.fn(),
    setQueryData: jest.fn(),
    invalidateQueries: mockInvalidateQueries,
  })),
  useQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useMutation: jest.fn((config) => {
    return {
      mutate: (params: any) => {
        Promise.resolve(config.mutationFn(params)).then((data) => {
          if (config.onSuccess) {
            return config.onSuccess(data, params, undefined);
          }
          return undefined;
        });
      },
      mutateAsync: async (params: any) => {
        const data = await config.mutationFn(params);
        if (config.onSuccess) {
          await config.onSuccess(data, params, undefined);
        }
        return data;
      },
      isPending: false,
      isError: false,
    };
  }),
}));

// Dynamically import after mocks are set up
import {
  useMarkAllEpisodesUnwatched,
  useMarkAllEpisodesWatched,
  useMarkEpisodeUnwatched,
  useMarkEpisodeWatched,
  useShowEpisodeTracking,
} from '@/src/hooks/useEpisodeTracking';
import { act, renderHook } from '@testing-library/react-native';

describe('useMarkEpisodeWatched', () => {
  const mockShowMetadata = {
    tvShowName: 'Test Show',
    posterPath: '/test.jpg',
  };

  const mockSeasonEpisodes: Episode[] = [
    {
      id: 1,
      name: 'Episode 1',
      episode_number: 1,
      season_number: 1,
      air_date: '2024-01-01',
      overview: '',
      still_path: null,
      runtime: null,
      vote_average: 8,
    },
    {
      id: 2,
      name: 'Episode 2',
      episode_number: 2,
      season_number: 1,
      air_date: '2024-01-08',
      overview: '',
      still_path: null,
      runtime: null,
      vote_average: 8,
    },
    {
      id: 3,
      name: 'Episode 3',
      episode_number: 3,
      season_number: 1,
      air_date: '2024-01-15',
      overview: '',
      still_path: null,
      runtime: null,
      vote_average: 8,
    },
    {
      id: 4,
      name: 'Episode 4',
      episode_number: 4,
      season_number: 1,
      air_date: '2024-01-22',
      overview: '',
      still_path: null,
      runtime: null,
      vote_average: 8,
    },
    {
      id: 5,
      name: 'Episode 5',
      episode_number: 5,
      season_number: 1,
      air_date: '2024-01-29',
      overview: '',
      still_path: null,
      runtime: null,
      vote_average: 8,
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockInvalidateQueries.mockClear();
  });

  it('should only mark current episode when shouldMarkPrevious is false', async () => {
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      result.current.mutate({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeData: {
          episodeId: 5,
          episodeName: 'Episode 5',
          episodeAirDate: '2024-01-29',
        },
        showMetadata: mockShowMetadata,
        previousEpisodesOptions: {
          seasonEpisodes: mockSeasonEpisodes,
          shouldMarkPrevious: false,
        },
      });
    });

    // Should mark current episode
    expect(episodeTrackingService.markEpisodeWatched).toHaveBeenCalledWith(
      123,
      1,
      5,
      expect.any(Object),
      mockShowMetadata
    );

    // Should NOT mark previous episodes
    expect(episodeTrackingService.markAllEpisodesWatched).not.toHaveBeenCalled();
  });

  it('should mark previous episodes when shouldMarkPrevious is true', async () => {
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      result.current.mutate({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeData: {
          episodeId: 5,
          episodeName: 'Episode 5',
          episodeAirDate: '2024-01-29',
        },
        showMetadata: mockShowMetadata,
        previousEpisodesOptions: {
          seasonEpisodes: mockSeasonEpisodes,
          shouldMarkPrevious: true,
        },
      });
    });

    // Should mark current episode
    expect(episodeTrackingService.markEpisodeWatched).toHaveBeenCalledWith(
      123,
      1,
      5,
      expect.any(Object),
      mockShowMetadata
    );

    // Should mark previous episodes (1-4)
    expect(episodeTrackingService.markAllEpisodesWatched).toHaveBeenCalledWith(
      123,
      1,
      expect.arrayContaining([
        expect.objectContaining({ episode_number: 1 }),
        expect.objectContaining({ episode_number: 2 }),
        expect.objectContaining({ episode_number: 3 }),
        expect.objectContaining({ episode_number: 4 }),
      ]),
      mockShowMetadata
    );

    // Should have 4 previous episodes
    const callArgs = (episodeTrackingService.markAllEpisodesWatched as jest.Mock).mock.calls[0];
    expect(callArgs[2]).toHaveLength(4);
  });

  it('should not mark previous episodes for episode 1', async () => {
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      result.current.mutate({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 1,
        episodeData: {
          episodeId: 1,
          episodeName: 'Episode 1',
          episodeAirDate: '2024-01-01',
        },
        showMetadata: mockShowMetadata,
        previousEpisodesOptions: {
          seasonEpisodes: mockSeasonEpisodes,
          shouldMarkPrevious: true,
        },
      });
    });

    // Should mark current episode
    expect(episodeTrackingService.markEpisodeWatched).toHaveBeenCalled();

    // Should NOT mark previous episodes (there are none for episode 1)
    expect(episodeTrackingService.markAllEpisodesWatched).not.toHaveBeenCalled();
  });

  it('should work without previousEpisodesOptions', async () => {
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      result.current.mutate({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeData: {
          episodeId: 5,
          episodeName: 'Episode 5',
          episodeAirDate: '2024-01-29',
        },
        showMetadata: mockShowMetadata,
        // No previousEpisodesOptions
      });
    });

    // Should mark current episode
    expect(episodeTrackingService.markEpisodeWatched).toHaveBeenCalled();

    // Should NOT mark previous episodes
    expect(episodeTrackingService.markAllEpisodesWatched).not.toHaveBeenCalled();
  });

  it('should still mark current episode if markAllEpisodesWatched fails', async () => {
    // Make markAllEpisodesWatched throw an error
    (episodeTrackingService.markAllEpisodesWatched as jest.Mock).mockRejectedValueOnce(
      new Error('Network error')
    );

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      await result.current.mutateAsync({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeData: {
          episodeId: 5,
          episodeName: 'Episode 5',
          episodeAirDate: '2024-01-29',
        },
        showMetadata: mockShowMetadata,
        previousEpisodesOptions: {
          seasonEpisodes: mockSeasonEpisodes,
          shouldMarkPrevious: true,
        },
      });
    });

    // Current episode should still be marked
    expect(episodeTrackingService.markEpisodeWatched).toHaveBeenCalledWith(
      123,
      1,
      5,
      expect.any(Object),
      mockShowMetadata
    );

    // markAllEpisodesWatched was called (and failed)
    expect(episodeTrackingService.markAllEpisodesWatched).toHaveBeenCalled();

    // Error was logged but not thrown
    expect(consoleSpy).toHaveBeenCalledWith(
      '[useMarkEpisodeWatched] Mark previous episodes failed:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });

  it('invalidates show and all-shows queries after marking episode watched', async () => {
    const { result } = renderHook(() => useMarkEpisodeWatched());

    await act(async () => {
      await result.current.mutateAsync({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeData: {
          episodeId: 5,
          episodeName: 'Episode 5',
          episodeAirDate: '2024-01-29',
        },
        showMetadata: mockShowMetadata,
      });
    });

    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'test-user-123', 123],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'allShows', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['lists', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['list-membership-index', 'test-user-123'],
      refetchType: 'active',
    });
  });

  it('invalidates tracking and list queries after marking episode unwatched', async () => {
    const { result } = renderHook(() => useMarkEpisodeUnwatched());

    await act(async () => {
      await result.current.mutateAsync({
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
      });
    });

    expect(episodeTrackingService.markEpisodeUnwatched).toHaveBeenCalledWith(123, 1, 5);
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'test-user-123', 123],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'allShows', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['lists', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['list-membership-index', 'test-user-123'],
      refetchType: 'active',
    });
  });

  it('invalidates tracking and list queries after marking all season episodes watched', async () => {
    const { result } = renderHook(() => useMarkAllEpisodesWatched());

    await act(async () => {
      await result.current.mutateAsync({
        tvShowId: 123,
        seasonNumber: 1,
        episodes: mockSeasonEpisodes,
        showMetadata: mockShowMetadata,
      });
    });

    expect(episodeTrackingService.markAllEpisodesWatched).toHaveBeenCalledWith(
      123,
      1,
      mockSeasonEpisodes,
      mockShowMetadata
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'test-user-123', 123],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'allShows', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['lists', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['list-membership-index', 'test-user-123'],
      refetchType: 'active',
    });
  });

  it('invalidates tracking and list queries after marking all season episodes unwatched', async () => {
    const { result } = renderHook(() => useMarkAllEpisodesUnwatched());

    await act(async () => {
      await result.current.mutateAsync({
        tvShowId: 123,
        seasonNumber: 1,
        episodes: mockSeasonEpisodes,
      });
    });

    expect(episodeTrackingService.markAllEpisodesUnwatched).toHaveBeenCalledWith(
      123,
      1,
      mockSeasonEpisodes
    );
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'test-user-123', 123],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['episodeTracking', 'allShows', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['lists', 'test-user-123'],
    });
    expect(mockInvalidateQueries).toHaveBeenCalledWith({
      queryKey: ['list-membership-index', 'test-user-123'],
      refetchType: 'active',
    });
  });

  it('uses shared cache windows for show episode tracking query', () => {
    renderHook(() => useShowEpisodeTracking(123));

    expect(useQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['episodeTracking', 'test-user-123', 123],
        enabled: true,
        staleTime: READ_QUERY_CACHE_WINDOWS.statusStaleTimeMs,
        gcTime: READ_QUERY_CACHE_WINDOWS.statusGcTimeMs,
      })
    );
  });
});
