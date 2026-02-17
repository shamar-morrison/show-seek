import { auth, db } from '@/src/firebase/config';
import { READ_OPTIMIZATION_FLAGS } from '@/src/config/readOptimization';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  auditedGetDoc,
  auditedGetDocs,
} from '@/src/services/firestoreReadAudit';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { createTimeout } from '@/src/utils/timeout';
import {
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';

class FavoriteEpisodeService {
  private isDebugLoggingEnabled() {
    return __DEV__ && READ_OPTIMIZATION_FLAGS.enableServiceQueryDebugLogs;
  }

  private logDebug(event: string, payload: Record<string, unknown>) {
    if (!this.isDebugLoggingEnabled()) {
      return;
    }

    console.log(`[FavoriteEpisodeService.${event}]`, payload);
  }

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
   * Add an episode to favorites
   */
  async addFavoriteEpisode(userId: string, episodeData: Omit<FavoriteEpisode, 'addedAt'>) {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous || user.uid !== userId) {
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
      if (!user || user.isAnonymous || user.uid !== userId) {
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
      if (!user || user.isAnonymous || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      this.logDebug('getFavoriteEpisodes:start', {
        userId,
        path: `users/${userId}/favorite_episodes`,
      });

      const episodesRef = this.getFavoriteEpisodesCollection(userId);
      const q = query(episodesRef, orderBy('addedAt', 'desc'));
      const snapshot = await Promise.race([
        auditedGetDocs(q, {
          path: `users/${userId}/favorite_episodes`,
          queryKey: 'favoriteEpisodes',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisodes',
        }),
        createTimeout(),
      ]);

      const episodes = snapshot.docs.map((doc) => doc.data() as FavoriteEpisode);
      this.logDebug('getFavoriteEpisodes:result', {
        userId,
        docCount: snapshot.size,
        resultCount: episodes.length,
      });
      return episodes;
    } catch (error) {
      this.logDebug('getFavoriteEpisodes:error', {
        userId,
        error,
      });
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] getFavoriteEpisodes error:', error);
      throw new Error(message);
    }
  }

  async getFavoriteEpisode(userId: string, episodeId: string): Promise<FavoriteEpisode | null> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous || user.uid !== userId) {
        throw new Error('Please sign in to continue');
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      const snapshot = await Promise.race([
        auditedGetDoc(episodeRef, {
          path: `users/${userId}/favorite_episodes/${episodeId}`,
          queryKey: 'favoriteEpisodeById',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisode',
        }),
        createTimeout(),
      ]);

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.data() as FavoriteEpisode;
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[FavoriteEpisodeService] getFavoriteEpisode error:', error);
      throw new Error(message);
    }
  }
}

export const favoriteEpisodeService = new FavoriteEpisodeService();
