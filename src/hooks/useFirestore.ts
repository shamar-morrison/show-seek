import { useState, useEffect } from 'react';
import { useAuth } from '@/src/context/auth';
import {
  firestoreHelpers,
  FavoriteItem,
  WatchlistItem,
  RatingItem,
} from '@/src/firebase/firestore';

export function useFavorites() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setFavorites([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = firestoreHelpers.subscribeFavorites(user.uid, (data) => {
      setFavorites(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  return { favorites, loading };
}

export function useWatchlist() {
  const { user } = useAuth();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setWatchlist([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = firestoreHelpers.subscribeWatchlist(user.uid, (data) => {
      setWatchlist(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  return { watchlist, loading };
}

export function useRatings() {
  const { user } = useAuth();
  const [ratings, setRatings] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRatings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsubscribe = firestoreHelpers.subscribeRatings(user.uid, (data) => {
      setRatings(data);
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  return { ratings, loading };
}
