import { useLongPressPressGuard } from '@/src/hooks/useLongPressPressGuard';
import { act, renderHook } from '@testing-library/react-native';

describe('useLongPressPressGuard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('calls onPress for a normal press', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPressPressGuard({ onPress, onLongPress }));

    act(() => {
      result.current.handlePress();
    });

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).not.toHaveBeenCalled();
  });

  it('calls onLongPress on long press', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPressPressGuard({ onPress, onLongPress }));

    act(() => {
      result.current.handleLongPress();
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('suppresses the press immediately after a long press', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPressPressGuard({ onPress, onLongPress }));

    act(() => {
      result.current.handleLongPress();
      result.current.handlePress();
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('allows a later press after press out resets the guard', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result } = renderHook(() => useLongPressPressGuard({ onPress, onLongPress }));

    act(() => {
      result.current.handleLongPress();
      result.current.handlePressOut();
      jest.runAllTimers();
      result.current.handlePress();
    });

    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('clears the pending timeout on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    const { result, unmount } = renderHook(() => useLongPressPressGuard({ onPress, onLongPress }));

    act(() => {
      result.current.handleLongPress();
      result.current.handlePressOut();
    });

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();

    clearTimeoutSpy.mockRestore();
  });
});
