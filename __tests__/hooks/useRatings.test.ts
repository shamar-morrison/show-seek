import { useMediaRating } from '@/src/hooks/useRatings';
import { renderHook } from '@testing-library/react-native';

// Mock the rating service
jest.mock('@/src/services/RatingService', () => ({
  ratingService: {
    subscribeToUserRatings: jest.fn((onData) => {
      // Call onData with mock ratings
      onData([
        { id: '123', mediaType: 'movie', rating: 8 },
        { id: '456', mediaType: 'tv', rating: 7 },
      ]);
      // Return unsubscribe function
      return jest.fn();
    }),
    saveRating: jest.fn(),
    deleteRating: jest.fn(),
    saveEpisodeRating: jest.fn(),
    deleteEpisodeRating: jest.fn(),
  },
}));

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    getQueryData: jest.fn((key) => {
      if (key[0] === 'ratings') {
        return [
          { id: '123', mediaType: 'movie', rating: 8 },
          { id: '456', mediaType: 'tv', rating: 7 },
        ];
      }
      return undefined;
    }),
    setQueryData: jest.fn(),
  }),
  useQuery: jest.fn(({ queryKey }) => {
    if (queryKey[0] === 'ratings') {
      return {
        data: [
          { id: '123', mediaType: 'movie', rating: 8 },
          { id: '456', mediaType: 'tv', rating: 7 },
        ],
        isLoading: false,
        error: null,
      };
    }
    return { data: undefined, isLoading: true, error: null };
  }),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isLoading: false,
    isPending: false,
  })),
}));

describe('useRatings hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useMediaRating', () => {
    it('should return the user rating for a rated movie', () => {
      const { result } = renderHook(() => useMediaRating(123, 'movie'));

      expect(result.current.userRating).toBe(8);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return the user rating for a rated TV show', () => {
      const { result } = renderHook(() => useMediaRating(456, 'tv'));

      expect(result.current.userRating).toBe(7);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return 0 for an unrated media item', () => {
      const { result } = renderHook(() => useMediaRating(999, 'movie'));

      expect(result.current.userRating).toBe(0);
    });

    it('should not match rating if media type is different', () => {
      // Media ID 123 exists as a movie, not as TV
      const { result } = renderHook(() => useMediaRating(123, 'tv'));

      expect(result.current.userRating).toBe(0);
    });
  });
});
