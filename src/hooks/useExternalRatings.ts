/**
 * External ratings (IMDb, Rotten Tomatoes, Metacritic, Letterboxd, Trakt) from MDBList.
 *
 * React Query keeps them in memory; src/api/mdblist keeps them on the phone for 7 days.
 */
import { useQuery } from '@tanstack/react-query';

import {
  ExternalRatings,
  fetchExternalRatings,
  hasValidRatings,
  MDBLIST_CACHE_DURATION_MS,
} from '../api/mdblist';

interface UseExternalRatingsResult {
  ratings: ExternalRatings | null;
  imdbId: string | null;
  isLoading: boolean;
  isError: boolean;
}

/**
 * @param mediaType - 'movie' or 'tv'
 * @param mediaId - TMDB ID (MDBList looks titles up by it directly)
 * @returns Ratings (null when there are none to show, which hides the section)
 */
export function useExternalRatings(
  mediaType: 'movie' | 'tv',
  mediaId: number
): UseExternalRatingsResult {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['external-ratings', 'mdblist', mediaType, mediaId],
    queryFn: async () => {
      const ratings = await fetchExternalRatings(mediaType, mediaId);
      return hasValidRatings(ratings) ? ratings : null;
    },
    enabled: !!mediaId,
    staleTime: MDBLIST_CACHE_DURATION_MS,
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1, // Only retry once: every request counts against the shared daily limit.
  });

  return {
    ratings: data ?? null,
    imdbId: data?.imdbId ?? null,
    isLoading,
    isError,
  };
}
