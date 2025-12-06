import { useMemo } from 'react';
import { useFavoritePersons } from './useFavoritePersons';
import { useLists } from './useLists';
import { useRatings } from './useRatings';

export interface ProfileStats {
  movieRatingsCount: number;
  tvRatingsCount: number;
  favoritePersonsCount: number;
  favoritesMovieCount: number;
  favoritesTvCount: number;
}

/**
 * Hook to compute profile activity statistics from existing subscriptions.
 * No additional Firestore queries needed - all data comes from existing hooks.
 */
export const useProfileStats = () => {
  const { data: ratings, isLoading: ratingsLoading } = useRatings();
  const { data: lists, isLoading: listsLoading } = useLists();
  const { data: favoritePersons, isLoading: personsLoading } = useFavoritePersons();

  const stats = useMemo<ProfileStats>(() => {
    // Count ratings by media type
    const movieRatingsCount = ratings?.filter((r) => r.mediaType === 'movie').length ?? 0;
    const tvRatingsCount = ratings?.filter((r) => r.mediaType === 'tv').length ?? 0;

    // Count favorite persons
    const favoritePersonsCount = favoritePersons?.length ?? 0;

    // Find favorites list and count by media type
    const favoritesList = lists?.find((l) => l.id === 'favorites');
    const favoritesItems = favoritesList?.items ? Object.values(favoritesList.items) : [];
    const favoritesMovieCount = favoritesItems.filter((i) => i.media_type === 'movie').length;
    const favoritesTvCount = favoritesItems.filter((i) => i.media_type === 'tv').length;

    return {
      movieRatingsCount,
      tvRatingsCount,
      favoritePersonsCount,
      favoritesMovieCount,
      favoritesTvCount,
    };
  }, [ratings, lists, favoritePersons]);

  const isLoading = ratingsLoading || listsLoading || personsLoading;

  return {
    stats,
    isLoading,
  };
};
