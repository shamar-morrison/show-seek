import { getApiLanguage } from '@/src/api/tmdb';
import { getGenres } from '@/src/utils/genreCache';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const GENRE_QUERY_CACHE_TIME =
  process.env.NODE_ENV === 'test' ? Infinity : 30 * 24 * 60 * 60 * 1000;

/**
 * Hook to fetch and cache genres for a specific media type (movie or TV).
 * Automatically updates when the media type or language changes.
 */
export function useGenres(type: 'movie' | 'tv') {
  const language = getApiLanguage();

  return useQuery({
    queryKey: ['genres', type, language],
    queryFn: () => getGenres(type),
    staleTime: GENRE_QUERY_CACHE_TIME,
    gcTime: GENRE_QUERY_CACHE_TIME,
  });
}

/**
 * Helper hook for screens that need both movie and TV genres (e.g., search).
 * Returns a merged map of all genres from both types.
 */
export function useAllGenres() {
  const movieGenres = useGenres('movie');
  const tvGenres = useGenres('tv');

  const allGenres = useMemo(
    () => ({
      ...(movieGenres.data || {}),
      ...(tvGenres.data || {}),
    }),
    [movieGenres.data, tvGenres.data]
  );

  return {
    data: allGenres,
    isLoading: movieGenres.isLoading || tvGenres.isLoading,
    error: movieGenres.error || tvGenres.error,
  };
}
