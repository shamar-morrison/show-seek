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
export const useProgressiveRender = (): { isReady: boolean } => {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Use setTimeout(0) to defer to the next event loop tick
    // This allows the navigation to start before mounting heavy content
    const timeoutId = setTimeout(() => {
      setIsReady(true);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
    };
  }, []);

  return { isReady };
};
