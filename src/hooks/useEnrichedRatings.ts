import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Movie, tmdbApi, TVShow } from '../api/tmdb';
import { useAuth } from '../context/auth';
import { RatingItem } from '../services/RatingService';
import { useRatings } from './useRatings';

export interface EnrichedMovieRating {
  rating: RatingItem;
  movie: Movie | null;
}

export interface EnrichedTVRating {
  rating: RatingItem;
  tvShow: TVShow | null;
}

/**
 * Batch fetch movies in chunks to avoid rate limits
 */
async function fetchMoviesInBatches(movieIds: number[]): Promise<Map<number, Movie>> {
  const BATCH_SIZE = 20;
  const results = new Map<number, Movie>();

  for (let i = 0; i < movieIds.length; i += BATCH_SIZE) {
    const batch = movieIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map((id) =>
      tmdbApi
        .getMovieDetails(id)
        .then((movie) => ({ id, movie }))
        .catch((error) => {
          console.warn(`Failed to fetch movie ${id}:`, error);
          return { id, movie: null };
        })
    );

    const batchResults = await Promise.all(promises);
    batchResults.forEach(({ id, movie }) => {
      if (movie) {
        results.set(id, movie);
      }
    });
  }

  return results;
}

/**
 * Batch fetch TV shows in chunks to avoid rate limits
 */
async function fetchTVShowsInBatches(tvIds: number[]): Promise<Map<number, TVShow>> {
  const BATCH_SIZE = 20;
  const results = new Map<number, TVShow>();

  for (let i = 0; i < tvIds.length; i += BATCH_SIZE) {
    const batch = tvIds.slice(i, i + BATCH_SIZE);
    const promises = batch.map((id) =>
      tmdbApi
        .getTVShowDetails(id)
        .then((tvShow) => ({ id, tvShow }))
        .catch((error) => {
          console.warn(`Failed to fetch TV show ${id}:`, error);
          return { id, tvShow: null };
        })
    );

    const batchResults = await Promise.all(promises);
    batchResults.forEach(({ id, tvShow }) => {
      if (tvShow) {
        results.set(id, tvShow);
      }
    });
  }

  return results;
}

/**
 * Hook to get movie ratings enriched with TMDB movie details
 */
export function useEnrichedMovieRatings() {
  const { user } = useAuth();
  const { data: ratings, isLoading: isLoadingRatings, error: ratingsError } = useRatings();

  const movieRatings = useMemo(
    () => ratings?.filter((r) => r.mediaType === 'movie') || [],
    [ratings]
  );

  const movieRatingIds = useMemo(
    () => movieRatings.map((r) => `${r.id}:${r.rating}`).join(','),
    [movieRatings]
  );

  const query = useQuery({
    queryKey: ['enriched-movie-ratings', user?.uid, movieRatingIds],
    queryFn: async (): Promise<EnrichedMovieRating[]> => {
      if (movieRatings.length === 0) return [];

      const movieIds = movieRatings.map((r) => parseInt(r.id, 10));
      const moviesMap = await fetchMoviesInBatches(movieIds);

      return movieRatings.map((rating) => ({
        rating,
        movie: moviesMap.get(parseInt(rating.id, 10)) || null,
      }));
    },
    enabled: !isLoadingRatings && movieRatings.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    ...query,
    data: !isLoadingRatings && movieRatings.length === 0 ? [] : query.data,
    isLoading: isLoadingRatings || query.isLoading,
  };
}

/**
 * Hook to get TV show ratings enriched with TMDB TV details
 */
export function useEnrichedTVRatings() {
  const { user } = useAuth();
  const { data: ratings, isLoading: isLoadingRatings, error: ratingsError } = useRatings();

  const tvRatings = useMemo(() => ratings?.filter((r) => r.mediaType === 'tv') || [], [ratings]);

  const tvRatingIds = useMemo(
    () => tvRatings.map((r) => `${r.id}:${r.rating}`).join(','),
    [tvRatings]
  );

  const query = useQuery({
    queryKey: ['enriched-tv-ratings', user?.uid, tvRatingIds],
    queryFn: async (): Promise<EnrichedTVRating[]> => {
      if (tvRatings.length === 0) return [];

      const tvIds = tvRatings.map((r) => parseInt(r.id, 10));
      const tvShowsMap = await fetchTVShowsInBatches(tvIds);

      return tvRatings.map((rating) => ({
        rating,
        tvShow: tvShowsMap.get(parseInt(rating.id, 10)) || null,
      }));
    },
    enabled: !isLoadingRatings && tvRatings.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    ...query,
    data: !isLoadingRatings && tvRatings.length === 0 ? [] : query.data,
    isLoading: isLoadingRatings || query.isLoading,
  };
}
