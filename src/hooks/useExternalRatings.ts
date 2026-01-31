/**
 * Hook for fetching external ratings from OMDb API
 *
 * Uses React Query for state management and AsyncStorage for persistent 24-hour caching.
 */
import { tmdbApi } from '@/src/api/tmdb';
import { useQuery } from '@tanstack/react-query';

import { ExternalRatings, fetchExternalRatings, hasValidRatings } from '../api/omdb';

interface UseExternalRatingsResult {
  ratings: ExternalRatings | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * Fetch external ratings (IMDb, Rotten Tomatoes, Metacritic) for a movie or TV show
 *
 * @param mediaType - 'movie' or 'tv'
 * @param mediaId - TMDB media ID
 * @returns Ratings data, loading state, and error state
 */
export function useExternalRatings(
  mediaType: 'movie' | 'tv',
  mediaId: number
): UseExternalRatingsResult {
  const {
    data: ratings,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['external-ratings', mediaType, mediaId],
    queryFn: async () => {
      // Step 1: Get IMDB ID from TMDB
      const externalIds =
        mediaType === 'movie'
          ? await tmdbApi.getMovieExternalIds(mediaId)
          : await tmdbApi.getTVExternalIds(mediaId);

      const imdbId = externalIds.imdb_id;
      if (!imdbId) {
        return null;
      }

      // Step 2: Fetch ratings from OMDb (with internal caching)
      const result = await fetchExternalRatings(imdbId);

      // Return null if no valid ratings to trigger section hide
      if (!hasValidRatings(result)) {
        return null;
      }

      return result;
    },
    enabled: !!mediaId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - match AsyncStorage cache
    gcTime: 24 * 60 * 60 * 1000, // Keep in memory for 24 hours
    retry: 1, // Only retry once to avoid burning API quota
  });

  return {
    ratings: ratings ?? null,
    isLoading,
    isError,
  };
}
