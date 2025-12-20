import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export interface RatingItem {
  id: string; // mediaId for movies/TV, composite ID for episodes
  mediaType: 'movie' | 'tv' | 'episode';
  rating: number;
  ratedAt: number;

  // Common metadata for all media types (movies, TV, episodes)
  title?: string;
  posterPath?: string | null;
  releaseDate?: string | null;

  // Episode-specific metadata (only present when mediaType === 'episode')
  tvShowId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  tvShowName?: string;
}

class RatingService {
  private getUserRatingRef(userId: string, mediaType: 'movie' | 'tv', mediaId: string) {
    return doc(db, 'users', userId, 'ratings', `${mediaType}-${mediaId}`);
  }

  private getUserRatingsCollection(userId: string) {
    return collection(db, 'users', userId, 'ratings');
  }

  /**
   * Subscribe to all ratings for the current user
   */
  subscribeToUserRatings(
    callback: (ratings: RatingItem[]) => void,
    onError?: (error: Error) => void
  ) {
    const user = auth.currentUser;
    if (!user) return () => {};

    const ratingsRef = this.getUserRatingsCollection(user.uid);
    const q = query(ratingsRef, orderBy('ratedAt', 'desc'));

    return onSnapshot(
      q,
      (snapshot) => {
        const ratings: RatingItem[] = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as RatingItem[];

        callback(ratings);
      },
      (error) => {
        console.error('[RatingService] Subscription error:', error);
        const message = getFirestoreErrorMessage(error);
        if (onError) {
          onError(new Error(message));
        }
        callback([]);
      }
    );
  }

  /**
   * Save or update a rating for a media item
   */
  async saveRating(
    mediaId: number,
    mediaType: 'movie' | 'tv',
    rating: number,
    metadata?: {
      title: string;
      posterPath: string | null;
      releaseDate: string | null;
    }
  ) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());

      const ratingData: RatingItem = {
        id: mediaId.toString(),
        mediaType,
        rating,
        ratedAt: Date.now(),
        ...(metadata && {
          title: metadata.title,
          posterPath: metadata.posterPath,
          releaseDate: metadata.releaseDate,
        }),
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(ratingRef, ratingData), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[RatingService] saveRating error:', error);
      throw new Error(message);
    }
  }

  /**
   * Delete a rating for a media item
   */
  async deleteRating(mediaId: number, mediaType: 'movie' | 'tv') {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(ratingRef), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[RatingService] deleteRating error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get a single rating for a media item
   */
  async getRating(mediaId: number, mediaType: 'movie' | 'tv'): Promise<RatingItem | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const docSnap = await Promise.race([getDoc(ratingRef), timeoutPromise]);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as RatingItem;
      }

      return null;
    } catch (error) {
      console.error('[RatingService] getRating error:', error);
      return null;
    }
  }

  /**
   * Helper to create episode document ID
   */
  private getEpisodeDocumentId(
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ): string {
    return `episode-${tvShowId}-${seasonNumber}-${episodeNumber}`;
  }

  /**
   * Get reference for episode rating
   */
  private getUserEpisodeRatingRef(
    userId: string,
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ) {
    const docId = this.getEpisodeDocumentId(tvShowId, seasonNumber, episodeNumber);
    return doc(db, 'users', userId, 'ratings', docId);
  }

  /**
   * Save or update a rating for an episode
   */
  async saveEpisodeRating(
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number,
    rating: number,
    episodeMetadata: {
      episodeName: string;
      tvShowName: string;
      posterPath: string | null;
    }
  ) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const ratingRef = this.getUserEpisodeRatingRef(
        user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber
      );

      const episodeId = this.getEpisodeDocumentId(tvShowId, seasonNumber, episodeNumber);

      const ratingData: RatingItem = {
        id: episodeId,
        mediaType: 'episode',
        rating,
        ratedAt: Date.now(),
        tvShowId,
        seasonNumber,
        episodeNumber,
        episodeName: episodeMetadata.episodeName,
        tvShowName: episodeMetadata.tvShowName,
        posterPath: episodeMetadata.posterPath,
      };

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([setDoc(ratingRef, ratingData), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[RatingService] saveEpisodeRating error:', error);
      throw new Error(message);
    }
  }

  /**
   * Delete a rating for an episode
   */
  async deleteEpisodeRating(tvShowId: number, seasonNumber: number, episodeNumber: number) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Please sign in to continue');

      const ratingRef = this.getUserEpisodeRatingRef(
        user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber
      );

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      await Promise.race([deleteDoc(ratingRef), timeoutPromise]);
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[RatingService] deleteEpisodeRating error:', error);
      throw new Error(message);
    }
  }

  /**
   * Get a single rating for an episode
   */
  async getEpisodeRating(
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<RatingItem | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;

      const ratingRef = this.getUserEpisodeRatingRef(
        user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber
      );

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timed out')), 10000);
      });

      const docSnap = await Promise.race([getDoc(ratingRef), timeoutPromise]);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as RatingItem;
      }

      return null;
    } catch (error) {
      console.error('[RatingService] getEpisodeRating error:', error);
      return null;
    }
  }
}

export const ratingService = new RatingService();
