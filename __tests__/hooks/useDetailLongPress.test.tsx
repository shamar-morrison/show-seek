import { SimilarMediaItem } from '@/src/components/detail/types';
import { useDetailLongPress } from '@/src/hooks/useDetailLongPress';
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

const mockRequireAccount = jest.fn();

// Mock expo-haptics
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Light: 'light',
    Medium: 'medium',
    Heavy: 'heavy',
  },
}));

jest.mock('@/src/context/auth', () => ({
  useAuth: () => ({
    user: { uid: 'user-1' },
    isGuest: false,
  }),
}));

jest.mock('@/src/context/GuestAccessContext', () => ({
  useGuestAccess: () => ({
    requireAccount: mockRequireAccount,
  }),
}));

describe('useDetailLongPress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockMovieItem: SimilarMediaItem = {
    id: 123,
    title: 'Test Movie',
    name: undefined,
    poster_path: '/test-poster.jpg',
    release_date: '2024-01-15',
    first_air_date: undefined,
    vote_average: 8.5,
  };

  const mockTVItem: SimilarMediaItem = {
    id: 456,
    title: undefined,
    name: 'Test TV Show',
    poster_path: '/test-tv-poster.jpg',
    release_date: undefined,
    first_air_date: '2024-02-20',
    vote_average: 7.9,
  };

  it('should return initial state with null selectedMediaItem', () => {
    const { result } = renderHook(() => useDetailLongPress('movie'));

    expect(result.current.selectedMediaItem).toBeNull();
    expect(result.current.addToListModalRef).toBeDefined();
    expect(result.current.toastRef).toBeDefined();
    expect(typeof result.current.handleLongPress).toBe('function');
    expect(typeof result.current.handleShowToast).toBe('function');
  });

  it('should call haptic feedback on long press', () => {
    const { result } = renderHook(() => useDetailLongPress('movie'));

    act(() => {
      result.current.handleLongPress(mockMovieItem);
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
  });

  it('should set selected media item with correct structure for movies', () => {
    const { result } = renderHook(() => useDetailLongPress('movie'));

    act(() => {
      result.current.handleLongPress(mockMovieItem);
    });

    expect(result.current.selectedMediaItem).toEqual({
      id: 123,
      media_type: 'movie',
      title: 'Test Movie',
      name: undefined,
      poster_path: '/test-poster.jpg',
      release_date: '2024-01-15',
      first_air_date: undefined,
      vote_average: 8.5,
    });
  });

  it('should set selected media item with correct structure for TV shows', () => {
    const { result } = renderHook(() => useDetailLongPress('tv'));

    act(() => {
      result.current.handleLongPress(mockTVItem);
    });

    expect(result.current.selectedMediaItem).toEqual({
      id: 456,
      media_type: 'tv',
      title: 'Test TV Show', // Falls back to name since title is undefined
      name: 'Test TV Show',
      poster_path: '/test-tv-poster.jpg',
      release_date: '2024-02-20', // Falls back to first_air_date
      first_air_date: '2024-02-20',
      vote_average: 7.9,
    });
  });

  it('should handle items with missing optional fields', () => {
    const minimalItem: SimilarMediaItem = {
      id: 789,
      poster_path: null,
      vote_average: 0,
    };

    const { result } = renderHook(() => useDetailLongPress('movie'));

    act(() => {
      result.current.handleLongPress(minimalItem);
    });

    expect(result.current.selectedMediaItem).toEqual({
      id: 789,
      media_type: 'movie',
      title: '', // Falls back to empty string when no title or name
      name: undefined,
      poster_path: null,
      release_date: '', // Falls back to empty string when no dates
      first_air_date: undefined,
      vote_average: 0,
    });
  });

  it('should use media type from hook parameter', () => {
    const { result: movieResult } = renderHook(() => useDetailLongPress('movie'));
    const { result: tvResult } = renderHook(() => useDetailLongPress('tv'));

    act(() => {
      movieResult.current.handleLongPress(mockMovieItem);
    });
    expect(movieResult.current.selectedMediaItem?.media_type).toBe('movie');

    act(() => {
      tvResult.current.handleLongPress(mockMovieItem);
    });
    expect(tvResult.current.selectedMediaItem?.media_type).toBe('tv');
  });
});
