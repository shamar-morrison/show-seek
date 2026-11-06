import { useCallback, useEffect, useState } from 'react';

/** A slow image should degrade the card, not block sharing forever. */
export const IMAGE_SETTLE_TIMEOUT_MS = 6000;

interface SettledState {
  resetKey: string;
  settled: ReadonlySet<string>;
  timedOut: boolean;
}

const freshState = (resetKey: string): SettledState => ({
  resetKey,
  settled: new Set(),
  timedOut: false,
});

/**
 * Reports when a set of images has finished loading, successfully or not.
 * Change `resetKey` whenever the images remount, since they will load again.
 */
export function useImagesSettled(
  imageKeys: readonly string[],
  resetKey: string,
  timeoutMs: number = IMAGE_SETTLE_TIMEOUT_MS
) {
  const [state, setState] = useState<SettledState>(() => freshState(resetKey));
  const current = state.resetKey === resetKey ? state : freshState(resetKey);

  useEffect(() => {
    const timer = setTimeout(() => {
      setState((prev) => ({
        ...(prev.resetKey === resetKey ? prev : freshState(resetKey)),
        timedOut: true,
      }));
    }, timeoutMs);

    return () => clearTimeout(timer);
  }, [resetKey, timeoutMs]);

  const markSettled = useCallback(
    (key: string) => {
      setState((prev) => {
        const base = prev.resetKey === resetKey ? prev : freshState(resetKey);
        if (base.settled.has(key)) return base;
        return { ...base, settled: new Set(base.settled).add(key) };
      });
    },
    [resetKey]
  );

  return {
    isReady: current.timedOut || imageKeys.every((key) => current.settled.has(key)),
    markSettled,
  };
}
