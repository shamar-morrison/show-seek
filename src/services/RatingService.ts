import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { trackSaveRating } from '@/src/services/analytics';
import {
  createServiceLogger,
  getSignedInUser,
  requireSignedInUser,
  rethrowFirestoreError,
  toFirestoreError,
} from '@/src/services/serviceSupport';
import { raceWithTimeout } from '@/src/utils/timeout';
import { collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

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

type RatingMediaType = RatingItem['mediaType'];

const VALID_MEDIA_TYPES: readonly RatingMediaType[] = ['movie', 'tv', 'episode'];

const toFiniteNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    const parsed = value.toMillis();
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const getValidMediaType = (value: unknown): RatingMediaType | null => {
  return VALID_MEDIA_TYPES.includes(value as RatingMediaType) ? (value as RatingMediaType) : null;
};

const getNormalizedRatingId = (
  candidateId: unknown,
  fallbackDocId: string,
  mediaType: RatingMediaType
): string | null => {
  if (typeof candidateId === 'string' && candidateId.trim() !== '') {
    return candidateId;
  }

  if (!fallbackDocId) {
    return null;
  }

  if (mediaType === 'episode') {
    return fallbackDocId;
  }

  const prefixedId = `${mediaType}-`;
  return fallbackDocId.startsWith(prefixedId)
    ? fallbackDocId.slice(prefixedId.length)
    : fallbackDocId;
};

export function normalizeRatingItem(
  raw: unknown,
  fallbackDocId: string,
  source = 'RatingService'
): RatingItem | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`[${source}] Skipping invalid rating doc ${fallbackDocId}: expected object data.`);
    return null;
  }

  const data = raw as Record<string, unknown>;
  const mediaType = getValidMediaType(data.mediaType);
  const rating = toFiniteNumber(data.rating);
  const ratedAt = toFiniteNumber(data.ratedAt);
  const tvShowIdNum = toFiniteNumber(data.tvShowId);
  const seasonNumberNum = toFiniteNumber(data.seasonNumber);
  const episodeNumberNum = toFiniteNumber(data.episodeNumber);

  if (!mediaType || rating === null || ratedAt === null) {
    console.warn(
      `[${source}] Skipping invalid rating doc ${fallbackDocId}: missing valid mediaType, rating, or ratedAt.`
    );
    return null;
  }

  const id = getNormalizedRatingId(data.id, fallbackDocId, mediaType);
  if (!id) {
    console.warn(`[${source}] Skipping invalid rating doc ${fallbackDocId}: missing valid id.`);
    return null;
  }

  return {
    id,
    mediaType,
    rating,
    ratedAt,
    ...(typeof data.title === 'string' && { title: data.title }),
    ...((typeof data.posterPath === 'string' || data.posterPath === null) && {
      posterPath: data.posterPath as string | null,
    }),
    ...((typeof data.releaseDate === 'string' || data.releaseDate === null) && {
      releaseDate: data.releaseDate as string | null,
    }),
    ...(tvShowIdNum !== null && { tvShowId: tvShowIdNum }),
    ...(seasonNumberNum !== null && {
      seasonNumber: seasonNumberNum,
    }),
    ...(episodeNumberNum !== null && {
      episodeNumber: episodeNumberNum,
    }),
    ...(typeof data.episodeName === 'string' && { episodeName: data.episodeName }),
    ...(typeof data.tvShowName === 'string' && { tvShowName: data.tvShowName }),
  };
}

class RatingService {
  private logDebug = createServiceLogger('RatingService');

  private getUserRatingRef(userId: string, mediaType: 'movie' | 'tv', mediaId: string) {
    return doc(db, 'users', userId, 'ratings', `${mediaType}-${mediaId}`);
  }

  private getUserRatingsCollection(userId: string) {
    return collection(db, 'users', userId, 'ratings');
  }

  async getUserRatings(userId: string): Promise<RatingItem[]> {
    const ratingsRef = this.getUserRatingsCollection(userId);

    try {
      this.logDebug('getUserRatings:start', {
        userId,
        path: `users/${userId}/ratings`,
      });

      const snapshot = await raceWithTimeout(
        auditedGetDocs(ratingsRef, {
          path: `users/${userId}/ratings`,
          queryKey: 'ratings',
          callsite: 'RatingService.getUserRatings',
        })
      );

      const ratings = snapshot.docs
        .map((ratingDoc) =>
          normalizeRatingItem(ratingDoc.data(), ratingDoc.id, 'RatingService.getUserRatings')
        )
        .filter((rating): rating is RatingItem => rating !== null)
        .sort((a, b) => b.ratedAt - a.ratedAt);

      this.logDebug('getUserRatings:result', {
        userId,
        docCount: snapshot.size,
        resultCount: ratings.length,
      });

      return ratings;
    } catch (error) {
      this.logDebug('getUserRatings:error', {
        userId,
        error,
      });
      throw toFirestoreError(error);
    }
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
  ): Promise<RatingItem> {
    try {
      const user = requireSignedInUser();

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

      await raceWithTimeout(setDoc(ratingRef, ratingData));
      void trackSaveRating({ mediaType, rating });
      return ratingData;
    } catch (error) {
      return rethrowFirestoreError('RatingService.saveRating', error);
    }
  }

  /**
   * Delete a rating for a media item
   */
  async deleteRating(mediaId: number, mediaType: 'movie' | 'tv') {
    try {
      const user = requireSignedInUser();

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());

      await raceWithTimeout(deleteDoc(ratingRef));
    } catch (error) {
      return rethrowFirestoreError('RatingService.deleteRating', error);
    }
  }

  /**
   * Get a single rating for a media item
   */
  async getRating(mediaId: number, mediaType: 'movie' | 'tv'): Promise<RatingItem | null> {
    try {
      const user = getSignedInUser();
      if (!user) return null;

      const ratingRef = this.getUserRatingRef(user.uid, mediaType, mediaId.toString());
      this.logDebug('getRating:start', {
        userId: user.uid,
        mediaId,
        mediaType,
        path: `users/${user.uid}/ratings/${mediaType}-${mediaId}`,
      });

      const docSnap = await raceWithTimeout(
        auditedGetDoc(ratingRef, {
          path: `users/${user.uid}/ratings/${mediaType}-${mediaId}`,
          queryKey: 'ratingByMedia',
          callsite: 'RatingService.getRating',
        })
      );

      if (docSnap.exists()) {
        const rating = normalizeRatingItem(docSnap.data(), docSnap.id, 'RatingService.getRating');
        this.logDebug('getRating:result', {
          userId: user.uid,
          mediaId,
          mediaType,
          exists: rating !== null,
        });
        return rating;
      }

      this.logDebug('getRating:result', {
        userId: user.uid,
        mediaId,
        mediaType,
        exists: false,
      });

      return null;
    } catch (error) {
      this.logDebug('getRating:error', {
        mediaId,
        mediaType,
        error,
      });
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
  ): Promise<RatingItem> {
    try {
      const user = requireSignedInUser();

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

      await raceWithTimeout(setDoc(ratingRef, ratingData));
      return ratingData;
    } catch (error) {
      return rethrowFirestoreError('RatingService.saveEpisodeRating', error);
    }
  }

  /**
   * Delete a rating for an episode
   */
  async deleteEpisodeRating(tvShowId: number, seasonNumber: number, episodeNumber: number) {
    try {
      const user = requireSignedInUser();

      const ratingRef = this.getUserEpisodeRatingRef(
        user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber
      );

      await raceWithTimeout(deleteDoc(ratingRef));
    } catch (error) {
      return rethrowFirestoreError('RatingService.deleteEpisodeRating', error);
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
      const user = getSignedInUser();
      if (!user) return null;

      const ratingRef = this.getUserEpisodeRatingRef(
        user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber
      );
      this.logDebug('getEpisodeRating:start', {
        userId: user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber,
        path: `users/${user.uid}/ratings/episode-${tvShowId}-${seasonNumber}-${episodeNumber}`,
      });

      const docSnap = await raceWithTimeout(
        auditedGetDoc(ratingRef, {
          path: `users/${user.uid}/ratings/episode-${tvShowId}-${seasonNumber}-${episodeNumber}`,
          queryKey: 'ratingByEpisode',
          callsite: 'RatingService.getEpisodeRating',
        })
      );

      if (docSnap.exists()) {
        const rating = normalizeRatingItem(
          docSnap.data(),
          docSnap.id,
          'RatingService.getEpisodeRating'
        );
        this.logDebug('getEpisodeRating:result', {
          userId: user.uid,
          tvShowId,
          seasonNumber,
          episodeNumber,
          exists: rating !== null,
        });
        return rating;
      }

      this.logDebug('getEpisodeRating:result', {
        userId: user.uid,
        tvShowId,
        seasonNumber,
        episodeNumber,
        exists: false,
      });

      return null;
    } catch (error) {
      this.logDebug('getEpisodeRating:error', {
        tvShowId,
        seasonNumber,
        episodeNumber,
        error,
      });
      console.error('[RatingService] getEpisodeRating error:', error);
      return null;
    }
  }
}

export const ratingService = new RatingService();
