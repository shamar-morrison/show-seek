import { useCallback, useEffect, useRef } from 'react';

interface UseLongPressPressGuardOptions {
  onPress: () => void;
  onLongPress?: () => void;
}

interface UseLongPressPressGuardResult {
  handlePress: () => void;
  handleLongPress: () => void;
  handlePressOut: () => void;
}

export function useLongPressPressGuard({
  onPress,
  onLongPress,
}: UseLongPressPressGuardOptions): UseLongPressPressGuardResult {
  const longPressHandledRef = useRef(false);
  const longPressResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPressHandled = useCallback(() => {
    if (longPressResetTimeoutRef.current) {
      clearTimeout(longPressResetTimeoutRef.current);
      longPressResetTimeoutRef.current = null;
    }

    longPressHandledRef.current = false;
  }, []);

  const scheduleLongPressReset = useCallback(() => {
    if (longPressResetTimeoutRef.current) {
      clearTimeout(longPressResetTimeoutRef.current);
    }

    longPressResetTimeoutRef.current = setTimeout(() => {
      longPressHandledRef.current = false;
      longPressResetTimeoutRef.current = null;
    }, 0);
  }, []);

  useEffect(() => clearLongPressHandled, [clearLongPressHandled]);

  const handlePress = useCallback(() => {
    if (longPressHandledRef.current) {
      clearLongPressHandled();
      return;
    }

    onPress();
  }, [clearLongPressHandled, onPress]);

  const handleLongPress = useCallback(() => {
    if (!onLongPress) {
      return;
    }

    clearLongPressHandled();
    longPressHandledRef.current = true;
    onLongPress();
  }, [clearLongPressHandled, onLongPress]);

  const handlePressOut = useCallback(() => {
    if (!longPressHandledRef.current) {
      return;
    }

    scheduleLongPressReset();
  }, [scheduleLongPressReset]);

  return {
    handlePress,
    handleLongPress,
    handlePressOut,
  };
}
