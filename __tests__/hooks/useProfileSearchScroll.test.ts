import { useProfileSearchScroll } from '@/src/hooks/useProfileSearchScroll';
import { SPACING } from '@/src/constants/theme';
import { renderHook, act } from '@testing-library/react-native';

describe('useProfileSearchScroll', () => {
  const createScrollRef = () => ({
    current: { scrollTo: jest.fn() } as any,
  });

  it('scrolls to a recorded offset (same-tab path)', () => {
    const scrollRef = createScrollRef();
    const { result } = renderHook(() => useProfileSearchScroll(scrollRef, () => 'spoiler'));

    act(() => {
      result.current.registerItemLayout('blurPlotSpoilers', 500);
    });

    let scrolled = false;
    act(() => {
      scrolled = result.current.scrollToItem('blurPlotSpoilers');
    });

    expect(scrolled).toBe(true);
    expect(scrollRef.current.scrollTo).toHaveBeenCalledWith({
      y: 500 - SPACING.s,
      animated: true,
    });
  });

  it('returns false without scrolling when no offset is recorded', () => {
    const scrollRef = createScrollRef();
    const { result } = renderHook(() => useProfileSearchScroll(scrollRef, () => 'spoiler'));

    let scrolled = true;
    act(() => {
      scrolled = result.current.scrollToItem('unknown-id');
    });

    expect(scrolled).toBe(false);
    expect(scrollRef.current.scrollTo).not.toHaveBeenCalled();
  });

  it('resolves a parked cross-tab scroll once the target onLayout arrives', () => {
    const scrollRef = createScrollRef();
    let query = 'trakt';
    const { result } = renderHook(() =>
      useProfileSearchScroll(scrollRef, () => query)
    );

    // Tab switch happens before the new tab has laid out: park the scroll.
    act(() => {
      result.current.queuePendingScroll('trakt', 'trakt');
    });

    // Selected-tab effect runs but the offset is unknown — stays pending.
    let resolved = true;
    act(() => {
      resolved = result.current.resolvePendingScroll();
    });
    expect(resolved).toBe(false);
    expect(scrollRef.current.scrollTo).not.toHaveBeenCalled();

    // The new tab mounts and its onLayout fires — scroll resolves, no timer.
    act(() => {
      result.current.registerItemLayout('trakt', 320);
    });
    expect(scrollRef.current.scrollTo).toHaveBeenCalledWith({
      y: 320 - SPACING.s,
      animated: true,
    });

    // Pending is cleared: a repeat resolve is a no-op.
    act(() => {
      resolved = result.current.resolvePendingScroll();
    });
    expect(resolved).toBe(false);
    expect(scrollRef.current.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('does not resolve a pending scroll after the query changed', () => {
    const scrollRef = createScrollRef();
    let query = 'trakt';
    const { result } = renderHook(() =>
      useProfileSearchScroll(scrollRef, () => query)
    );

    act(() => {
      result.current.queuePendingScroll('trakt', 'trakt');
    });

    // User kept typing; the parked scroll is stale.
    query = 'trakt sync';
    act(() => {
      result.current.registerItemLayout('trakt', 320);
    });

    expect(scrollRef.current.scrollTo).not.toHaveBeenCalled();
  });

  it('clearPendingScroll drops a parked scroll', () => {
    const scrollRef = createScrollRef();
    const { result } = renderHook(() => useProfileSearchScroll(scrollRef, () => 'trakt'));

    act(() => {
      result.current.queuePendingScroll('trakt', 'trakt');
      result.current.clearPendingScroll();
      result.current.registerItemLayout('trakt', 320);
    });

    // Offset recorded, but no auto-scroll since nothing was pending.
    expect(scrollRef.current.scrollTo).not.toHaveBeenCalled();

    // Direct scroll still works through the same offset path.
    act(() => {
      expect(result.current.scrollToItem('trakt')).toBe(true);
    });
    expect(scrollRef.current.scrollTo).toHaveBeenCalledTimes(1);
  });
});
