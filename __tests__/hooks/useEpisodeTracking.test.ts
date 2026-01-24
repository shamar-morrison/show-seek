import type { Episode } from '@/src/api/tmdb';
import type { MarkEpisodeWatchedParams } from '@/src/hooks/useEpisodeTracking';
import { episodeTrackingService } from '@/src/services/EpisodeTrackingService';

// Mock dependencies
jest.mock('@/src/services/EpisodeTrackingService', () => ({
  episodeTrackingService: {
    markEpisodeWatched: jest.fn().mockResolvedValue(undefined),
    markAllEpisodesWatched: jest.fn().mockResolvedValue(undefined),
    subscribeToShowTracking: jest.fn((tvShowId, callback) => {
      callback(null);
      return jest.fn();
    }),
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
    invalidateQueries: jest.fn(),
  })),
  useQuery: jest.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
  useMutation: jest.fn((config) => ({
    mutate: (params: MarkEpisodeWatchedParams) => {
      config.mutationFn(params);
    },
    mutateAsync: config.mutationFn,
    isPending: false,
    isError: false,
  })),
}));

// Dynamically import after mocks are set up
import { useMarkEpisodeWatched } from '@/src/hooks/useEpisodeTracking';
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
});
