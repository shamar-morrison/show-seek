import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import {
  createServiceLogger,
  getSignedInUser,
  requireMatchingUser,
  rethrowFirestoreError,
} from '@/src/services/serviceSupport';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { raceWithTimeout } from '@/src/utils/timeout';
import { collection, deleteDoc, doc, orderBy, query, setDoc } from 'firebase/firestore';
import { db } from '@/src/firebase/config';

class FavoriteEpisodeService {
  private logDebug = createServiceLogger('FavoriteEpisodeService');

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
      requireMatchingUser(userId);

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeData.id);
      const favoriteData: FavoriteEpisode = {
        ...episodeData,
        addedAt: Date.now(),
      };

      await raceWithTimeout(setDoc(episodeRef, favoriteData));
    } catch (error) {
      return rethrowFirestoreError('FavoriteEpisodeService.addFavoriteEpisode', error);
    }
  }

  /**
   * Remove an episode from favorites
   */
  async removeFavoriteEpisode(userId: string, episodeId: string) {
    try {
      requireMatchingUser(userId);

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      await raceWithTimeout(deleteDoc(episodeRef));
    } catch (error) {
      return rethrowFirestoreError('FavoriteEpisodeService.removeFavoriteEpisode', error);
    }
  }

  /**
   * Get all favorite episodes for a user
   */
  async getFavoriteEpisodes(userId: string): Promise<FavoriteEpisode[]> {
    try {
      const user = getSignedInUser();
      if (!user || user.uid !== userId) {
        return [];
      }

      this.logDebug('getFavoriteEpisodes:start', {
        userId,
        path: `users/${userId}/favorite_episodes`,
      });

      const episodesRef = this.getFavoriteEpisodesCollection(userId);
      const q = query(episodesRef, orderBy('addedAt', 'desc'));
      const snapshot = await raceWithTimeout(
        auditedGetDocs(q, {
          path: `users/${userId}/favorite_episodes`,
          queryKey: 'favoriteEpisodes',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisodes',
        }),
      );

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
      return rethrowFirestoreError('FavoriteEpisodeService.getFavoriteEpisodes', error);
    }
  }

  async getFavoriteEpisode(userId: string, episodeId: string): Promise<FavoriteEpisode | null> {
    try {
      const user = getSignedInUser();
      if (!user || user.uid !== userId) {
        return null;
      }

      const episodeRef = this.getFavoriteEpisodeRef(userId, episodeId);
      const snapshot = await raceWithTimeout(
        auditedGetDoc(episodeRef, {
          path: `users/${userId}/favorite_episodes/${episodeId}`,
          queryKey: 'favoriteEpisodeById',
          callsite: 'FavoriteEpisodeService.getFavoriteEpisode',
        }),
      );

      if (!snapshot.exists()) {
        return null;
      }

      return snapshot.data() as FavoriteEpisode;
    } catch (error) {
      return rethrowFirestoreError('FavoriteEpisodeService.getFavoriteEpisode', error);
    }
  }
}

export const favoriteEpisodeService = new FavoriteEpisodeService();
