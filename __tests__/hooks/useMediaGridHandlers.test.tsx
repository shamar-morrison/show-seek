import { useMediaGridHandlers } from '@/src/hooks/useMediaGridHandlers';
import { ListMediaItem } from '@/src/services/ListService';
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

const mockPush = jest.fn();
const mockCurrentTab = { value: 'library' as string | null };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/src/context/TabContext', () => ({
  useCurrentTab: () => mockCurrentTab.value,
}));

const movieItem: ListMediaItem = {
  id: 101,
  title: 'Movie One',
  poster_path: '/movie.jpg',
  media_type: 'movie',
  vote_average: 7.2,
  release_date: '2024-05-01',
  addedAt: 123,
};

const tvItem: ListMediaItem = {
  id: 202,
  title: 'TV One',
  name: 'TV One',
  poster_path: '/tv.jpg',
  media_type: 'tv',
  vote_average: 8.1,
  release_date: '2024-06-01',
  first_air_date: '2024-06-01',
  addedAt: 456,
};

describe('useMediaGridHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentTab.value = 'library';
  });

  it('enters selection mode on long press and tracks selected items', () => {
    const { result } = renderHook(() => useMediaGridHandlers(false));

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    expect(Haptics.impactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Medium);
    expect(result.current.isSelectionMode).toBe(true);
    expect(result.current.selectedCount).toBe(1);
    expect(result.current.isItemSelected(movieItem)).toBe(true);
    expect(result.current.selectedMediaItems).toEqual([
      {
        id: 101,
        title: 'Movie One',
        poster_path: '/movie.jpg',
        media_type: 'movie',
        vote_average: 7.2,
        release_date: '2024-05-01',
      },
    ]);
  });

  it('toggles selection on tap while in selection mode and exits when empty', () => {
    const { result } = renderHook(() => useMediaGridHandlers(false));

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    act(() => {
      result.current.handleItemPress(movieItem);
    });

    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedCount).toBe(0);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('supports selecting multiple items while in selection mode', () => {
    const { result } = renderHook(() => useMediaGridHandlers(false));

    act(() => {
      result.current.handleLongPress(movieItem);
    });

    act(() => {
      result.current.handleItemPress(tvItem);
    });

    expect(result.current.selectedCount).toBe(2);
    expect(result.current.isItemSelected(movieItem)).toBe(true);
    expect(result.current.isItemSelected(tvItem)).toBe(true);
  });

  it('navigates to detail screens when not selecting', () => {
    const { result } = renderHook(() => useMediaGridHandlers(false));

    act(() => {
      result.current.handleItemPress(movieItem);
      result.current.handleItemPress(tvItem);
    });

    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/movie/101');
    expect(mockPush).toHaveBeenCalledWith('/(tabs)/library/tv/202');
  });

  it('clearSelection resets selection mode', () => {
    const { result } = renderHook(() => useMediaGridHandlers(false));

    act(() => {
      result.current.handleLongPress(movieItem);
      result.current.handleItemPress(tvItem);
    });

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.isSelectionMode).toBe(false);
    expect(result.current.selectedCount).toBe(0);
  });
});
