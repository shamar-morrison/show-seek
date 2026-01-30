/**
 * Tests for useProgressiveRender hook
 *
 * This hook defers rendering by one event loop tick using setTimeout(0),
 * allowing navigation transitions to complete before mounting heavy content.
 */

import { useProgressiveRender } from '@/src/hooks/useProgressiveRender';
import { act, renderHook } from '@testing-library/react-native';

describe('useProgressiveRender', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should return isReady as false initially', () => {
    const { result } = renderHook(() => useProgressiveRender());

    // Before the timer fires, isReady should be false
    expect(result.current.isReady).toBe(false);
  });

  it('should return isReady as true after the next event loop tick', () => {
    const { result } = renderHook(() => useProgressiveRender());

    // Initially false
    expect(result.current.isReady).toBe(false);

    // Advance timers to trigger the setTimeout(0)
    act(() => {
      jest.runAllTimers();
    });

    // Now isReady should be true
    expect(result.current.isReady).toBe(true);
  });

  it('should defer rendering by exactly one tick (setTimeout(0))', () => {
    const { result } = renderHook(() => useProgressiveRender());

    // Before any time has passed
    expect(result.current.isReady).toBe(false);

    // Advance by just enough to trigger setTimeout(0)
    act(() => {
      jest.advanceTimersByTime(0);
    });

    // Should now be ready (setTimeout(0) has fired)
    expect(result.current.isReady).toBe(true);
  });

  it('should clean up the timer on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

    const { unmount } = renderHook(() => useProgressiveRender());

    // Unmount before the timer fires
    unmount();

    // clearTimeout should have been called
    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });

  it('should stay false if unmounted before timer fires', () => {
    const { result, unmount } = renderHook(() => useProgressiveRender());

    // Initially false
    expect(result.current.isReady).toBe(false);

    // Unmount before timer fires
    unmount();

    // Running timers should not cause errors (timer was cleared)
    act(() => {
      jest.runAllTimers();
    });

    // isReady should still be false (from the last observed value)
    expect(result.current.isReady).toBe(false);
  });
});

/**
 * Test to verify the deferred listener pattern used in useCollectionTracking
 * This validates that setTimeout(0) properly defers initialization to the next event loop
 */
describe('Deferred Listener Pattern', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should call deferred callback after setTimeout(0)', () => {
    const immediateCallback = jest.fn();
    const deferredCallback = jest.fn();

    // Simulate the deferred pattern used in hooks
    immediateCallback();

    const timeoutId = setTimeout(() => {
      deferredCallback();
    }, 0);

    // Immediate callback was called
    expect(immediateCallback).toHaveBeenCalledTimes(1);

    // Deferred callback should NOT have been called yet
    expect(deferredCallback).not.toHaveBeenCalled();

    // Advance the event loop
    act(() => {
      jest.runAllTimers();
    });

    // Now deferred callback should have been called
    expect(deferredCallback).toHaveBeenCalledTimes(1);

    clearTimeout(timeoutId);
  });

  it('should allow navigation to start before heavy operations', () => {
    const operations: string[] = [];

    // Simulating render start (navigation begins)
    operations.push('render_start');

    // Deferred subscription setup (like in useCollectionTracking)
    setTimeout(() => {
      operations.push('subscription_setup');
    }, 0);

    // Render continues (navigation is happening)
    operations.push('render_end');

    // At this point, subscription should NOT be set up yet
    expect(operations).toEqual(['render_start', 'render_end']);

    // Now advance to next tick
    act(() => {
      jest.runAllTimers();
    });

    // Subscription setup should happen after render completes
    expect(operations).toEqual(['render_start', 'render_end', 'subscription_setup']);
  });
});
