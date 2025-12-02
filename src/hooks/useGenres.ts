import { useQuery } from '@tanstack/react-query';
import { getGenres } from '@/src/utils/genreCache';
import { useMemo } from 'react';

/**
 * Hook to fetch and cache genres for a specific media type (movie or TV).
 * Automatically updates when the media type changes.
 */
export function useGenres(type: 'movie' | 'tv') {
  return useQuery({
    queryKey: ['genres', type],
    queryFn: () => getGenres(type),
    staleTime: 30 * 24 * 60 * 60 * 1000, // 30 days
    gcTime: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

/**
 * Helper hook for screens that need both movie and TV genres (e.g., search).
 * Returns a merged map of all genres from both types.
 */
export function useAllGenres() {
  const movieGenres = useGenres('movie');
  const tvGenres = useGenres('tv');

  const allGenres = useMemo(() => ({
    ...(movieGenres.data || {}),
    ...(tvGenres.data || {}),
  }), [movieGenres.data, tvGenres.data]);

  return {
    data: allGenres,
    isLoading: movieGenres.isLoading || tvGenres.isLoading,
    error: movieGenres.error || tvGenres.error,
  };
}
