import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { createTimeout } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

class FavoriteEpisodeService {
  /**
   * Get reference to a specific favorite episode document
   */
  private getFavoriteEpisodeRef(userId: string, episodeId: string) {
    return doc(db, 'users', userId, 'favorite_episodes', episodeId);
  }

  /**
   * Get reference to user's favorite episodes collection
   */
  private getFavoriteEpisodesCollection(userId: string) {
    return collection(db, 'users', userId, 'favorite_episodes');
  }

  /**
   * Subscribe to all favorite episodes for the current user
   */
  subscribeToFavoriteEpisodes(
    userId: string,
    callback: (episodes: FavoriteEpisode[]) => void,
    onError?: (error: Error) => void
  ) {
    if (!userId) return () => {};

    const episodesRef = this.getFavoriteEpisodesCollection(userId);
    const q = query(episodesRef, orderBy('addedAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const episodes = snapshot.docs.map((doc) => doc.data() as FavoriteEpisode);
        callback(episodes);
      },
      (error) => {
        console.error('[FavoriteEpisodeService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
      }
    );
  }

  /**
   * Add an episode to favorites
   */
  async addFavoriteEpisode(userId: string, episodeData: Omit<FavoriteEpisode, 'addedAt'>) {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeData.id);
      const favoriteData: FavoriteEpisode = {
        ...episodeData,
        addedAt: Date.now(),
      };

      await Promise.race([setDoc(episodeRef, favoriteData), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] addFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }

  /**
   * Remove an episode from favorites
   */
  async removeFavoriteEpisode(userId: string, episodeId: string) {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      await Promise.race([deleteDoc(episodeRef), createTimeout()]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] removeFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get all favorite episodes for a user
   */
  async getFavoriteEpisodes(userId: string): Promise<FavoriteEpisode[]> {
    try {
      const user = auth.currentUser;
      if (!user || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodesRef = this.getFavoriteEpisodesCollection(userId);
      const q = query(episodesRef, orderBy('addedAt', 'desc'));
      const snapshot = await Promise.race([getDocs(q), createTimeout()]);

      return snapshot.docs.map((doc) => doc.data() as FavoriteEpisode);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] getFavoriteEpisodes error:', error);
      throw new Error(message);
    }
  }
}

export const favoriteEpisodeService = new FavoriteEpisodeService();
