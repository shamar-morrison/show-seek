import { renderHook } from '@testing-library/react-native';
import { useIsEpisodeFavorited } from '@/src/hooks/useFavoriteEpisodes';

// Mock useRealtimeSubscription
jest.mock('@/src/hooks/useRealtimeSubscription', () => ({
  useRealtimeSubscription: jest.fn(() => ({
    data: [
      { id: '123-1-5', tvShowId: 123, seasonNumber: 1, episodeNumber: 5 },
      { id: '456-2-10', tvShowId: 456, seasonNumber: 2, episodeNumber: 10 },
    ],
    isLoading: false,
  })),
}));

// Mock useAuth
jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({ user: { uid: 'test-user-id' } }),
}));

// Mock React Query
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: jest.fn(),
  useMutation: jest.fn(() => ({
    mutate: jest.fn(),
    mutateAsync: jest.fn(),
    isPending: false,
  })),
}));

describe('useFavoriteEpisodes hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('useIsEpisodeFavorited', () => {
    it('should return true for a favorited episode', () => {
      const { result } = renderHook(() => useIsEpisodeFavorited(123, 1, 5));
      expect(result.current.isFavorited).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return false for an episode not in favorites', () => {
      const { result } = renderHook(() => useIsEpisodeFavorited(123, 1, 6));
      expect(result.current.isFavorited).toBe(false);
    });

    it('should return false for a different show with same season/episode', () => {
      const { result } = renderHook(() => useIsEpisodeFavorited(789, 1, 5));
      expect(result.current.isFavorited).toBe(false);
    });
  });
});
