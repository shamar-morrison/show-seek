import { useEffect, useState } from 'react';

/**
 * Hook that defers heavy content rendering when expanding a collapsible section.
 * Shows a loading state immediately, then renders content after one event loop tick.
 *
 * This prevents UI jank when expanding sections with many child elements by allowing
 * the loading indicator to appear before the heavy rendering begins.
 *
 * @param isExpanded - Whether the section is currently expanded
 * @returns Object containing:
 *   - shouldRenderContent: true when heavy content should be rendered
 *   - isLoading: true when loading indicator should be shown
 *
 * Usage:
 * ```tsx
 * const { shouldRenderContent, isLoading } = useDeferredExpansion(isExpanded);
 *
 * if (!isExpanded) return null;
 *
 * if (isLoading) {
 *   return <ActivityIndicator />;
 * }
 *
 * if (shouldRenderContent) {
 *   return <HeavyContent />;
 * }
 * ```
 */
export const useDeferredExpansion = (
  isExpanded: boolean
): { shouldRenderContent: boolean; isLoading: boolean } => {
  const [shouldRenderContent, setShouldRenderContent] = useState(false);

  useEffect(() => {
    if (isExpanded) {
      // Defer rendering to the next event loop tick
      // This allows the loading indicator to appear first
      const timeoutId = setTimeout(() => {
        setShouldRenderContent(true);
      }, 0);

      return () => {
        clearTimeout(timeoutId);
      };
    } else {
      // Reset when collapsed
      setShouldRenderContent(false);
    }
  }, [isExpanded]);

  return {
    shouldRenderContent,
    isLoading: isExpanded && !shouldRenderContent,
  };
};
