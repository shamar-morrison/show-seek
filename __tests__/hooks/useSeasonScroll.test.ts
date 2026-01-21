import { useSeasonScroll } from '@/src/hooks/useSeasonScroll';
import { act, renderHook } from '@testing-library/react-native';

describe('useSeasonScroll', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns scrollViewRef and seasonRefs', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: null,
        seasonCount: 5,
        enabled: true,
      })
    );

    expect(result.current.scrollViewRef).toBeDefined();
    expect(result.current.seasonRefs).toBeDefined();
    expect(result.current.getSeasonLayoutHandler).toBeDefined();
    expect(result.current.hasScrolledToSeason).toBe(false);
  });

  it('does not scroll when targetSeason is null', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: null,
        seasonCount: 5,
        enabled: true,
      })
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.hasScrolledToSeason).toBe(false);
  });

  it('does not scroll when disabled', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: 2,
        seasonCount: 5,
        enabled: false,
      })
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.hasScrolledToSeason).toBe(false);
  });

  it('does not scroll when seasonCount is 0', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: 2,
        seasonCount: 0,
        enabled: true,
      })
    );

    act(() => {
      jest.advanceTimersByTime(500);
    });

    expect(result.current.hasScrolledToSeason).toBe(false);
  });

  it('getSeasonLayoutHandler creates a layout handler for a season', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: 2,
        seasonCount: 5,
        enabled: true,
      })
    );

    const handler = result.current.getSeasonLayoutHandler(2);
    expect(typeof handler).toBe('function');

    // Simulate layout event
    act(() => {
      handler({
        nativeEvent: {
          layout: { y: 100, height: 200 },
        },
      } as any);
    });

    // Check that the layout was stored
    expect(result.current.seasonRefs.current.get(2)).toEqual({
      y: 100,
      height: 200,
    });
  });

  it('marks hasScrolledToSeason as true after max attempts if layout not found', () => {
    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: 2,
        seasonCount: 5,
        enabled: true,
      })
    );

    // Wait for initial delay + all retry attempts
    // SCROLL_INITIAL_DELAY = 300, SCROLL_RETRY_INTERVAL = 100, SCROLL_MAX_ATTEMPTS = 20
    act(() => {
      jest.advanceTimersByTime(300 + 100 * 20 + 100);
    });

    expect(result.current.hasScrolledToSeason).toBe(true);
  });

  it('scrolls when layout is available', () => {
    const mockScrollTo = jest.fn();

    const { result } = renderHook(() =>
      useSeasonScroll({
        targetSeason: 2,
        seasonCount: 5,
        enabled: true,
      })
    );

    // Set up the scrollViewRef
    (result.current.scrollViewRef as any).current = {
      scrollTo: mockScrollTo,
    };

    // Add layout for season 2
    const handler = result.current.getSeasonLayoutHandler(2);
    act(() => {
      handler({
        nativeEvent: {
          layout: { y: 150, height: 200 },
        },
      } as any);
    });

    // Wait for initial delay
    act(() => {
      jest.advanceTimersByTime(300);
    });

    expect(mockScrollTo).toHaveBeenCalledWith({
      y: 130, // 150 - 20 offset
      animated: true,
    });
    expect(result.current.hasScrolledToSeason).toBe(true);
  });
});
