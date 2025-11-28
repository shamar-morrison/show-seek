import { FirebaseError } from 'firebase/app';
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

// Error message mapping for user-friendly feedback
const getFirestoreErrorMessage = (error: unknown): string => {
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

export interface RatingItem {
  id: string; // mediaId
  mediaType: 'movie' | 'tv';
  rating: number;
  ratedAt: number;
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
  async saveRating(mediaId: number, mediaType: 'movie' | 'tv', rating: number) {
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('User not authenticated');

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());

      const ratingData: RatingItem = {
        id: mediaId.toString(),
        mediaType,
        rating,
        ratedAt: Date.now(),
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
      if (!user) throw new Error('User not authenticated');

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
      const docSnap = await getDoc(ratingRef);

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
}

export const ratingService = new RatingService();
