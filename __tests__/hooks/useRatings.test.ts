import {
  useDeleteSeasonRating,
  useMediaRating,
  useRateSeason,
  useSeasonRating,
} from '@/src/hooks/useRatings';
import { renderHook } from '@testing-library/react-native';

const mockQueryClient = {
  cancelQueries: jest.fn(),
  getQueryData: jest.fn(),
  setQueryData: jest.fn(),
};

let lastMutationOptions: any;

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id' },
  }),
}));

jest.mock('@/src/services/RatingService', () => ({
  ratingService: {
    getRating: jest.fn((mediaId: number, mediaType: 'movie' | 'tv') => {
      if (mediaId === 123 && mediaType === 'movie') {
        return Promise.resolve({ id: '123', mediaType: 'movie', rating: 8, ratedAt: Date.now() });
      }
      if (mediaId === 456 && mediaType === 'tv') {
        return Promise.resolve({ id: '456', mediaType: 'tv', rating: 7, ratedAt: Date.now() });
      }
      return Promise.resolve(null);
    }),
    getSeasonRating: jest.fn((tvShowId: number, seasonNumber: number) => {
      if (tvShowId === 10 && seasonNumber === 1) {
        return Promise.resolve({
          id: 'season-10-1',
          mediaType: 'season',
          rating: 8.5,
          ratedAt: Date.now(),
          title: 'Season 1',
          tvShowId: 10,
          seasonNumber: 1,
          tvShowName: 'Test Show',
        });
      }
      return Promise.resolve(null);
    }),
    getEpisodeRating: jest.fn(),
    getUserRatings: jest.fn(),
    saveRating: jest.fn(),
    deleteRating: jest.fn(),
    saveEpisodeRating: jest.fn(),
    deleteEpisodeRating: jest.fn(),
    saveSeasonRating: jest.fn(),
    deleteSeasonRating: jest.fn(),
  },
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => mockQueryClient,
  useQuery: jest.fn(({ queryKey }) => {
    if (queryKey[0] === 'ratings') {
      return {
        data: [
          { id: '123', mediaType: 'movie', rating: 8, ratedAt: 100 },
          { id: '456', mediaType: 'tv', rating: 7, ratedAt: 90 },
        ],
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    if (queryKey[0] === 'rating') {
      const mediaType = queryKey[2];

      if (mediaType === 'movie' && queryKey[3] === 123) {
        return {
          data: { id: '123', mediaType: 'movie', rating: 8, ratedAt: Date.now() },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        };
      }

      if (mediaType === 'tv' && queryKey[3] === 456) {
        return {
          data: { id: '456', mediaType: 'tv', rating: 7, ratedAt: Date.now() },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        };
      }

      if (mediaType === 'season' && queryKey[3] === 10 && queryKey[4] === 1) {
        return {
          data: {
            id: 'season-10-1',
            mediaType: 'season',
            rating: 8.5,
            ratedAt: Date.now(),
            title: 'Season 1',
            tvShowId: 10,
            seasonNumber: 1,
            tvShowName: 'Test Show',
          },
          isLoading: false,
          error: null,
          refetch: jest.fn(),
        };
      }

      return {
        data: null,
        isLoading: false,
        error: null,
        refetch: jest.fn(),
      };
    }

    return { data: undefined, isLoading: true, error: null, refetch: jest.fn() };
  }),
  useMutation: jest.fn((options) => {
    lastMutationOptions = options;
    return {
      mutate: jest.fn(),
      mutateAsync: jest.fn(),
      isLoading: false,
      isPending: false,
    };
  }),
}));

describe('useRatings hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    lastMutationOptions = null;
    mockQueryClient.getQueryData.mockImplementation((key) => {
      if (key[0] === 'ratings') {
        return [
          { id: '123', mediaType: 'movie', rating: 8, ratedAt: 100 },
          { id: '456', mediaType: 'tv', rating: 7, ratedAt: 90 },
        ];
      }

      return null;
    });
  });

  describe('useMediaRating', () => {
    it('returns the user rating for a rated movie', () => {
      const { result } = renderHook(() => useMediaRating(123, 'movie'));

      expect(result.current.userRating).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns the user rating for a rated TV show', () => {
      const { result } = renderHook(() => useMediaRating(456, 'tv'));

      expect(result.current.userRating).toBe(7);
      expect(result.current.isLoading).toBe(false);
    });

    it('returns 0 for an unrated media item', () => {
      const { result } = renderHook(() => useMediaRating(999, 'movie'));

      expect(result.current.userRating).toBe(0);
    });

    it('does not match rating if media type is different', () => {
      const { result } = renderHook(() => useMediaRating(123, 'tv'));

      expect(result.current.userRating).toBe(0);
    });
  });

  describe('useSeasonRating', () => {
    it('returns the user rating for a rated season', () => {
      const { result } = renderHook(() => useSeasonRating(10, 1));

      expect(result.current.userRating).toBe(8.5);
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('season mutation hooks', () => {
    it('optimistically inserts season ratings into the detail cache and ratings list', async () => {
      renderHook(() => useRateSeason());

      await lastMutationOptions.onMutate({
        tvShowId: 10,
        seasonNumber: 1,
        rating: 9,
        seasonMetadata: {
          seasonName: 'Season 1',
          tvShowName: 'Test Show',
          posterPath: '/poster.jpg',
          airDate: '2024-01-01',
        },
      });

      expect(mockQueryClient.cancelQueries).toHaveBeenCalledWith({
        queryKey: ['rating', 'test-user-id', 'season', 10, 1],
      });
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['rating', 'test-user-id', 'season', 10, 1],
        expect.objectContaining({
          id: 'season-10-1',
          mediaType: 'season',
          rating: 9,
          title: 'Season 1',
          tvShowId: 10,
          seasonNumber: 1,
          tvShowName: 'Test Show',
        })
      );
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['ratings', 'test-user-id'],
        expect.arrayContaining([
          expect.objectContaining({
            id: 'season-10-1',
            mediaType: 'season',
          }),
        ])
      );
    });

    it('optimistically removes season ratings from the detail cache and ratings list', async () => {
      mockQueryClient.getQueryData.mockImplementation((key) => {
        if (key[0] === 'ratings') {
          return [
            { id: 'season-10-1', mediaType: 'season', rating: 9, ratedAt: 200 },
            { id: '123', mediaType: 'movie', rating: 8, ratedAt: 100 },
          ];
        }

        return {
          id: 'season-10-1',
          mediaType: 'season',
          rating: 9,
          ratedAt: 200,
        };
      });

      renderHook(() => useDeleteSeasonRating());

      await lastMutationOptions.onMutate({
        tvShowId: 10,
        seasonNumber: 1,
      });

      expect(mockQueryClient.cancelQueries).toHaveBeenCalledWith({
        queryKey: ['rating', 'test-user-id', 'season', 10, 1],
      });
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['rating', 'test-user-id', 'season', 10, 1],
        null
      );
      expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
        ['ratings', 'test-user-id'],
        expect.not.arrayContaining([
          expect.objectContaining({
            id: 'season-10-1',
          }),
        ])
      );
    });
  });
});
