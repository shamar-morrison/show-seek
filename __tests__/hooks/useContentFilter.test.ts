import { useContentFilter } from '@/src/hooks/useContentFilter';
import { renderHook } from '@testing-library/react-native';

// Mock dependencies
const mockUseAuth = jest.fn();
const mockUsePreferences = jest.fn();
const mockUseLists = jest.fn();

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockUsePreferences(),
}));

jest.mock('@/src/hooks/useLists', () => ({
  useLists: () => mockUseLists(),
}));

// Mock isReleased with actual implementation for predictable tests
jest.mock('@/src/utils/dateUtils', () => ({
  isReleased: (date: string | null | undefined) => {
    if (!date) return true; // fail-open
    // Use a fixed "today" for deterministic tests: 2025-06-15
    return date <= '2025-06-15';
  },
}));

describe('useContentFilter', () => {
  const mockMovies = [
    { id: 1, title: 'Released Movie', release_date: '2025-01-15' },
    { id: 2, title: 'Upcoming Movie', release_date: '2025-12-25' },
    { id: 3, title: 'No Date Movie' },
    { id: 4, title: 'Another Released', release_date: '2024-05-01' },
  ];

  const mockTVShows = [
    { id: 10, name: 'Released Show', first_air_date: '2025-03-01' },
    { id: 11, name: 'Upcoming Show', first_air_date: '2026-01-01' },
    { id: 12, name: 'No Date Show' },
  ];

  const mockWatchedList = {
    id: 'already-watched',
    items: { 1: { addedAt: 123 }, 4: { addedAt: 456 } },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: { uid: 'test-user' } });
    mockUsePreferences.mockReturnValue({ preferences: {} });
    mockUseLists.mockReturnValue({ data: [mockWatchedList] });
  });

  describe('when user is not authenticated', () => {
    it('returns all items without filtering', () => {
      mockUseAuth.mockReturnValue({ user: null });
      mockUsePreferences.mockReturnValue({
        preferences: { hideUnreleasedContent: true, hideWatchedContent: true },
      });

      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toEqual(mockMovies);
      expect(result.current).toHaveLength(4);
    });
  });

  describe('when no preferences are enabled', () => {
    it('returns all items', () => {
      mockUsePreferences.mockReturnValue({
        preferences: { hideUnreleasedContent: false, hideWatchedContent: false },
      });

      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toEqual(mockMovies);
    });
  });

  describe('hideUnreleasedContent', () => {
    beforeEach(() => {
      mockUsePreferences.mockReturnValue({
        preferences: { hideUnreleasedContent: true, hideWatchedContent: false },
      });
    });

    it('filters unreleased movies by release_date', () => {
      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toHaveLength(3);
      expect(result.current.map((m) => m.id)).toEqual([1, 3, 4]);
      expect(result.current.find((m) => m.id === 2)).toBeUndefined();
    });

    it('filters unreleased TV shows by first_air_date', () => {
      const { result } = renderHook(() => useContentFilter(mockTVShows));

      expect(result.current).toHaveLength(2);
      expect(result.current.map((s) => s.id)).toEqual([10, 12]);
      expect(result.current.find((s) => s.id === 11)).toBeUndefined();
    });

    it('keeps items with no date (fail-open behavior)', () => {
      const { result } = renderHook(() => useContentFilter(mockMovies));

      const noDateItem = result.current.find((m) => m.id === 3);
      expect(noDateItem).toBeDefined();
      expect(noDateItem?.title).toBe('No Date Movie');
    });
  });

  describe('hideWatchedContent', () => {
    beforeEach(() => {
      mockUsePreferences.mockReturnValue({
        preferences: { hideUnreleasedContent: false, hideWatchedContent: true },
      });
    });

    it('filters watched movies', () => {
      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toHaveLength(2);
      expect(result.current.map((m) => m.id)).toEqual([2, 3]);
    });

    it('returns all items when watched list is empty', () => {
      mockUseLists.mockReturnValue({ data: [{ id: 'already-watched', items: {} }] });

      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toEqual(mockMovies);
    });
  });

  describe('both preferences enabled', () => {
    it('applies both filters (watched AND unreleased)', () => {
      mockUsePreferences.mockReturnValue({
        preferences: { hideUnreleasedContent: true, hideWatchedContent: true },
      });

      const { result } = renderHook(() => useContentFilter(mockMovies));

      // Movies: 1 (watched, released), 2 (upcoming), 3 (no date), 4 (watched, released)
      // After hideWatched: 2, 3
      // After hideUnreleased: 3 (2 is upcoming, 3 has no date so kept)
      expect(result.current).toHaveLength(1);
      expect(result.current[0].id).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when items is undefined', () => {
      const { result } = renderHook(() => useContentFilter(undefined));

      expect(result.current).toEqual([]);
    });

    it('returns empty array when items is empty', () => {
      const { result } = renderHook(() => useContentFilter([]));

      expect(result.current).toEqual([]);
    });

    it('handles null preferences gracefully', () => {
      mockUsePreferences.mockReturnValue({ preferences: null });

      const { result } = renderHook(() => useContentFilter(mockMovies));

      expect(result.current).toEqual(mockMovies);
    });
  });
});
