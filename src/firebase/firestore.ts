import { Movie, TVShow } from '@/src/api/tmdb';
import { db } from '@/src/firebase/config';
import { FirebaseError } from 'firebase/app';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, setDoc } from 'firebase/firestore';

export interface FavoriteItem {
  id: string;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  addedAt: number;
  voteAverage?: number;
  releaseDate?: string;
}

export interface WatchlistItem extends FavoriteItem {}

export interface RatingItem {
  id: string;
  mediaType: 'movie' | 'tv';
  rating: number;
  ratedAt: number;
}

// Error message mapping for user-friendly feedback
export const getFirestoreErrorMessage = (error: unknown): string => {
  if (error instanceof FirebaseError) {
    switch (error.code) {
      case 'permission-denied':
        return 'You do not have permission to perform this action';
      case 'unavailable':
        return 'Network error. Please check your connection';
      case 'not-found':
        return 'The requested rating was not found';
      case 'deadline-exceeded':
        return 'Request timed out. Please try again';
      case 'resource-exhausted':
        return 'Too many requests. Please wait a moment';
      default:
        return `Database error: ${error.message}`;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
};

export const firestoreHelpers = {
  addToFavorites: async (userId: string, mediaId: number, item: Movie | TVShow) => {
    const favRef = doc(db, `users/${userId}/favorites/${mediaId}`);

    const favoriteData: FavoriteItem = {
      id: mediaId.toString(),
      mediaType: 'title' in item ? 'movie' : 'tv',
      title: 'title' in item ? item.title : item.name,
      posterPath: item.poster_path,
      addedAt: Date.now(),
      voteAverage: item.vote_average,
      releaseDate: 'release_date' in item ? item.release_date : item.first_air_date,
    };

    await setDoc(favRef, favoriteData);
  },

  removeFromFavorites: async (userId: string, mediaId: number) => {
    const favRef = doc(db, `users/${userId}/favorites/${mediaId}`);
    await deleteDoc(favRef);
  },

  addToWatchlist: async (userId: string, mediaId: number, item: Movie | TVShow) => {
    const watchRef = doc(db, `users/${userId}/watchlist/${mediaId}`);

    const watchlistData: WatchlistItem = {
      id: mediaId.toString(),
      mediaType: 'title' in item ? 'movie' : 'tv',
      title: 'title' in item ? item.title : item.name,
      posterPath: item.poster_path,
      addedAt: Date.now(),
      voteAverage: item.vote_average,
      releaseDate: 'release_date' in item ? item.release_date : item.first_air_date,
    };

    await setDoc(watchRef, watchlistData);
  },

  removeFromWatchlist: async (userId: string, mediaId: number) => {
    const watchRef = doc(db, `users/${userId}/watchlist/${mediaId}`);
    await deleteDoc(watchRef);
  },

  rateMedia: async (userId: string, mediaId: number, rating: number, mediaType: 'movie' | 'tv') => {
    const ratingRef = doc(db, `users/${userId}/ratings/${mediaId}`);

    const ratingData: RatingItem = {
      id: mediaId.toString(),
      mediaType,
      rating,
      ratedAt: Date.now(),
    };

    await setDoc(ratingRef, ratingData);
  },

  subscribeFavorites: (userId: string, callback: (favorites: FavoriteItem[]) => void) => {
    const favoritesRef = collection(db, `users/${userId}/favorites`);
    const q = query(favoritesRef, orderBy('addedAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const favorites: FavoriteItem[] = [];
      snapshot.forEach((doc) => {
        favorites.push(doc.data() as FavoriteItem);
      });
      callback(favorites);
    });
  },

  subscribeWatchlist: (userId: string, callback: (watchlist: WatchlistItem[]) => void) => {
    const watchlistRef = collection(db, `users/${userId}/watchlist`);
    const q = query(watchlistRef, orderBy('addedAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const watchlist: WatchlistItem[] = [];
      snapshot.forEach((doc) => {
        watchlist.push(doc.data() as WatchlistItem);
      });
      callback(watchlist);
    });
  },

  subscribeRatings: (userId: string, callback: (ratings: RatingItem[]) => void) => {
    const ratingsRef = collection(db, `users/${userId}/ratings`);
    const q = query(ratingsRef, orderBy('ratedAt', 'desc'));

    return onSnapshot(q, (snapshot) => {
      const ratings: RatingItem[] = [];
      snapshot.forEach((doc) => {
        ratings.push(doc.data() as RatingItem);
      });
      callback(ratings);
    });
  },
};
