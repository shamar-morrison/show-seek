import { useEffect, useState } from 'react';

/**
 * Hook that defers heavy rendering by one animation frame.
 * This allows the navigation transition to complete smoothly before
 * rendering a complex component tree on cached data.
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
    // Use requestAnimationFrame to yield control back to the UI thread
    // This allows the navigation transition to complete before we mount
    // the heavy component tree
    const frameId = requestAnimationFrame(() => {
      setIsReady(true);
    });

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, []);

  return { isReady };
};
