/**
 * Utility functions for media-related operations
 */

/**
 * Check if watch providers data contains any available providers
 * (streaming, rent, or buy options)
 */
export const hasWatchProviders = (providers: any): boolean => {
  if (!providers) return false;
  return (
    (providers.flatrate && providers.flatrate.length > 0) ||
    (providers.rent && providers.rent.length > 0) ||
    (providers.buy && providers.buy.length > 0)
  );
};
