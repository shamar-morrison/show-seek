import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

interface UseShuffleCycleOptions<T> {
  /** Total cycling time in ms before the target is revealed */
  duration?: number;
  /** Fastest cycling interval (start of the shuffle) */
  minInterval?: number;
  /** Slowest cycling interval (end of the shuffle) */
  maxInterval?: number;
  /** Called once the final item has been revealed */
  onReveal?: (item: T) => void;
}

const DEFAULT_DURATION = 2000;
const DEFAULT_MIN_INTERVAL = 80;
const DEFAULT_MAX_INTERVAL = 400;

/**
 * Slot-machine style shuffle: rapidly cycles through `items`, slowing down
 * over `duration`, then lands on a random target with a pulse + haptic.
 */
export function useShuffleCycle<T>(items: T[], options: UseShuffleCycleOptions<T> = {}) {
  const {
    duration = DEFAULT_DURATION,
    minInterval = DEFAULT_MIN_INTERVAL,
    maxInterval = DEFAULT_MAX_INTERVAL,
    onReveal,
  } = options;

  const [isAnimating, setIsAnimating] = useState(false);
  const [displayedItem, setDisplayedItem] = useState<T | null>(null);
  const [hasRevealed, setHasRevealed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;

  const posterScale = useSharedValue(1);
  const posterOpacity = useSharedValue(1);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsAnimating(false);
  }, []);

  const reset = useCallback(() => {
    cancel();
    setDisplayedItem(null);
    setHasRevealed(false);
    posterScale.value = 1;
    posterOpacity.value = 1;
  }, [cancel, posterScale, posterOpacity]);

  const start = useCallback(() => {
    if (items.length === 0) return;

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    setIsAnimating(true);
    setHasRevealed(false);

    const targetItem = items[Math.floor(Math.random() * items.length)];

    const reveal = () => {
      setDisplayedItem(targetItem);
      setHasRevealed(true);
      setIsAnimating(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRevealRef.current?.(targetItem);
    };

    // For a single item, skip the animation
    if (items.length === 1) {
      reveal();
      return;
    }

    const startTime = Date.now();
    let currentInterval = minInterval;
    let previousIndex = -1;

    const cycle = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed >= duration) {
        timeoutRef.current = null;
        posterScale.value = withSequence(
          withTiming(1.1, { duration: 150, easing: Easing.out(Easing.exp) }),
          withTiming(1, { duration: 100 })
        );
        reveal();
        return;
      }

      // Show a random item, avoiding an immediate repeat so the cycle visibly moves
      let index = Math.floor(Math.random() * items.length);
      if (index === previousIndex) {
        index = (index + 1) % items.length;
      }
      previousIndex = index;
      setDisplayedItem(items[index]);

      posterOpacity.value = withSequence(
        withTiming(0.7, { duration: currentInterval * 0.3 }),
        withTiming(1, { duration: currentInterval * 0.3 })
      );

      // Ease out: increase the interval as we approach the end
      const progress = elapsed / duration;
      currentInterval = minInterval + (maxInterval - minInterval) * Math.pow(progress, 2);

      timeoutRef.current = setTimeout(cycle, currentInterval);
    };

    cycle();
  }, [items, duration, minInterval, maxInterval, posterScale, posterOpacity]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const posterAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: posterScale.value }],
    opacity: posterOpacity.value,
  }));

  return {
    displayedItem,
    isAnimating,
    hasRevealed,
    start,
    cancel,
    reset,
    posterAnimatedStyle,
  };
}
