import { useEffect, useState } from 'react';

/**
 * Hook that defers heavy rendering by one event loop tick.
 * This allows the navigation transition to start before mounting
 * a heavy component tree on cached data.
 *
 * Usage:
 * ```
 * const { isReady } = useProgressiveRender();
 *
 * if (!isReady || isLoading) {
 *   return <Skeleton />;
 * }
 * // Render full content
 * ```
 */
export const useProgressiveRender = (resetKey?: unknown): { isReady: boolean } => {
  const [isReady, setIsReady] = useState(false);
  const [readyKey, setReadyKey] = useState(resetKey);

  useEffect(() => {
    setIsReady(false);

    // Use setTimeout(0) to defer to the next event loop tick
    // This allows the navigation to start before mounting heavy content
    const timeoutId = setTimeout(() => {
      setReadyKey(resetKey);
      setIsReady(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [resetKey]);

  return { isReady: isReady && Object.is(readyKey, resetKey) };
};
