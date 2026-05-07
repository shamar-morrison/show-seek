import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

// Create module-level mutable mock state
let mockUserId: string | null = 'test-user-id';
const mockTrackSaveRating = jest.fn();

// Mock the firebase config using a getter that reads the mutable state
jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

// Mock the firestore error helper
jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

const mockRaceWithTimeout = jest.fn((promise: Promise<unknown>) => promise);

jest.mock('@/src/utils/timeout', () => ({
  raceWithTimeout: (promise: Promise<unknown>) => mockRaceWithTimeout(promise),
}));

jest.mock('@/src/services/analytics', () => ({
  trackSaveRating: (...args: unknown[]) => mockTrackSaveRating(...args),
}));

import { ratingService } from '@/src/services/RatingService';

const buildSnapshotDoc = (id: string, data: Record<string, unknown>) => ({
  id,
  data: () => data,
});

describe('RatingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset current user to authenticated state
    mockUserId = 'test-user-id';
    mockRaceWithTimeout.mockImplementation((promise: Promise<unknown>) => promise);
  });

  describe('saveRating', () => {
    it('should call setDoc with correct rating data structure', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveRating(123, 'movie', 8, {
        title: 'Test Movie',
        posterPath: '/poster.jpg',
        releaseDate: '2024-01-01',
      });

      expect(doc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: '123',
          mediaType: 'movie',
          rating: 8,
          ratedAt: expect.any(Number),
          title: 'Test Movie',
          posterPath: '/poster.jpg',
          releaseDate: '2024-01-01',
        })
      );
      expect(mockTrackSaveRating).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '123',
          mediaType: 'movie',
          rating: 8,
          ratedAt: expect.any(Number),
          title: 'Test Movie',
          posterPath: '/poster.jpg',
          releaseDate: '2024-01-01',
        })
      );
    });

    it('should save rating without metadata', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-456' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveRating(456, 'movie', 7);

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: '456',
          mediaType: 'movie',
          rating: 7,
          ratedAt: expect.any(Number),
        })
      );

      // Should not have metadata fields
      const callArgs = (setDoc as jest.Mock).mock.calls[0][1];
      expect(callArgs.title).toBeUndefined();

      expect(mockTrackSaveRating).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '456',
          mediaType: 'movie',
          rating: 7,
          ratedAt: expect.any(Number),
        })
      );
      const trackedRating = mockTrackSaveRating.mock.calls[0][0] as Record<string, unknown>;
      expect(trackedRating.title).toBeUndefined();
      expect(trackedRating.posterPath).toBeUndefined();
      expect(trackedRating.releaseDate).toBeUndefined();
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      await expect(
        ratingService.saveRating(123, 'movie', 8, {
          title: 'Test',
          posterPath: null,
          releaseDate: null,
        })
      ).rejects.toThrow('Please sign in to continue');
    });

    it('should save TV show rating with correct mediaType', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/tv-789' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveRating(789, 'tv', 9);

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: '789',
          mediaType: 'tv',
          rating: 9,
        })
      );
    });
  });

  describe('deleteRating', () => {
    it('should call deleteDoc with correct document reference', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.deleteRating(123, 'movie');

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      await expect(ratingService.deleteRating(123, 'movie')).rejects.toThrow(
        'Please sign in to continue'
      );
    });
  });

  describe('getRating', () => {
    it('should return rating when document exists', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      const mockRatingData = {
        id: '123',
        mediaType: 'movie',
        rating: 8,
        ratedAt: 1234567890,
      };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: 'movie-123',
        data: () => mockRatingData,
      });

      const result = await ratingService.getRating(123, 'movie');

      expect(result).toEqual({
        ...mockRatingData,
      });
    });

    it('falls back to the document id when stored id is missing', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: 'movie-123',
        data: () => ({
          mediaType: 'movie',
          rating: '8',
          ratedAt: '1234567890',
        }),
      });

      const result = await ratingService.getRating(123, 'movie');

      expect(result).toEqual({
        id: '123',
        mediaType: 'movie',
        rating: 8,
        ratedAt: 1234567890,
      });
    });

    it('should return null when document does not exist', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-999' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      const result = await ratingService.getRating(999, 'movie');

      expect(result).toBeNull();
    });

    it('should return null when user is not authenticated', async () => {
      mockUserId = null;

      const result = await ratingService.getRating(123, 'movie');

      expect(result).toBeNull();
    });

    it('should return null when error occurs', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockRejectedValue(new Error('Firestore error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const result = await ratingService.getRating(123, 'movie');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('returns null when the stored rating document is invalid', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-123' };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: 'movie-123',
        data: () => ({
          mediaType: 'movie',
          rating: 8,
        }),
      });

      const result = await ratingService.getRating(123, 'movie');

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('getUserRatings', () => {
    it('normalizes legacy docs, skips invalid entries, and sorts by ratedAt descending', async () => {
      const mockCollectionRef = { path: 'users/test-user-id/ratings' };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (collection as jest.Mock).mockReturnValue(mockCollectionRef);
      (getDocs as jest.Mock).mockResolvedValue({
        size: 4,
        docs: [
          buildSnapshotDoc('movie-123', {
            mediaType: 'movie',
            rating: '8',
            ratedAt: '1700000000000',
            title: 'Normalized Movie',
          }),
          buildSnapshotDoc('season-10-1', {
            mediaType: 'season',
            rating: 8.5,
            ratedAt: 1700000000500,
            title: 'Season 1',
            tvShowId: 10,
            seasonNumber: 1,
            tvShowName: 'Show Name',
          }),
          buildSnapshotDoc('episode-10-1-2', {
            mediaType: 'episode',
            rating: 9,
            ratedAt: 1700000001000,
            episodeName: 'Pilot',
            tvShowName: 'Show Name',
          }),
          buildSnapshotDoc('tv-456', {
            mediaType: 'tv',
            rating: 7,
          }),
        ],
      });

      const result = await ratingService.getUserRatings('test-user-id');

      expect(result).toEqual([
        {
          id: 'episode-10-1-2',
          mediaType: 'episode',
          rating: 9,
          ratedAt: 1700000001000,
          episodeName: 'Pilot',
          tvShowName: 'Show Name',
        },
        {
          id: 'season-10-1',
          mediaType: 'season',
          rating: 8.5,
          ratedAt: 1700000000500,
          title: 'Season 1',
          tvShowId: 10,
          seasonNumber: 1,
          tvShowName: 'Show Name',
        },
        {
          id: '123',
          mediaType: 'movie',
          rating: 8,
          ratedAt: 1700000000000,
          title: 'Normalized Movie',
        },
      ]);
      expect(warnSpy).toHaveBeenCalledTimes(1);
      warnSpy.mockRestore();
    });
  });

  describe('getEpisodeRating', () => {
    it('returns null when the stored episode rating is invalid', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/episode-100-1-5' };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: 'episode-100-1-5',
        data: () => ({
          mediaType: 'episode',
          rating: 9,
        }),
      });

      const result = await ratingService.getEpisodeRating(100, 1, 5);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('saveEpisodeRating', () => {
    it('should save episode rating with composite document ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/episode-100-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveEpisodeRating(100, 1, 5, 9, {
        episodeName: 'Pilot',
        tvShowName: 'Test Show',
        posterPath: '/poster.jpg',
      });

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: 'episode-100-1-5',
          mediaType: 'episode',
          rating: 9,
          tvShowId: 100,
          seasonNumber: 1,
          episodeNumber: 5,
          episodeName: 'Pilot',
          tvShowName: 'Test Show',
          posterPath: '/poster.jpg',
          ratedAt: expect.any(Number),
        })
      );
      expect(mockTrackSaveRating).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'episode-100-1-5',
          mediaType: 'episode',
          rating: 9,
          ratedAt: expect.any(Number),
          tvShowId: 100,
          seasonNumber: 1,
          episodeNumber: 5,
          episodeName: 'Pilot',
          tvShowName: 'Test Show',
          posterPath: '/poster.jpg',
        })
      );
    });
  });

  describe('getSeasonRating', () => {
    it('returns null when the stored season rating is invalid', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/season-100-1' };
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => true,
        id: 'season-100-1',
        data: () => ({
          mediaType: 'season',
          rating: 9,
        }),
      });

      const result = await ratingService.getSeasonRating(100, 1);

      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('saveSeasonRating', () => {
    it('saves season rating with composite document ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/season-100-1' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveSeasonRating(100, 1, 8.5, {
        seasonName: 'Season 1',
        tvShowName: 'Test Show',
        posterPath: '/poster.jpg',
        airDate: '2024-01-01',
      });

      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          id: 'season-100-1',
          mediaType: 'season',
          rating: 8.5,
          title: 'Season 1',
          tvShowId: 100,
          seasonNumber: 1,
          tvShowName: 'Test Show',
          posterPath: '/poster.jpg',
          releaseDate: '2024-01-01',
          ratedAt: expect.any(Number),
        })
      );
      expect(mockTrackSaveRating).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'season-100-1',
          mediaType: 'season',
          rating: 8.5,
          title: 'Season 1',
          tvShowId: 100,
          seasonNumber: 1,
          tvShowName: 'Test Show',
          posterPath: '/poster.jpg',
          releaseDate: '2024-01-01',
          ratedAt: expect.any(Number),
        })
      );
    });
  });

  describe('deleteEpisodeRating', () => {
    it('should delete episode rating by composite ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/episode-100-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.deleteEpisodeRating(100, 1, 5);

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
  });

  describe('deleteSeasonRating', () => {
    it('deletes season rating by composite ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/season-100-1' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.deleteSeasonRating(100, 1);

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
  });

  describe('shared timeout wrapper', () => {
    it('wraps writes with the shared timeout helper', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-321' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      await ratingService.saveRating(321, 'movie', 8);

      expect(mockRaceWithTimeout).toHaveBeenCalled();
    });

    it('wraps reads with the shared timeout helper', async () => {
      const mockDocRef = { path: 'users/test-user-id/ratings/movie-654' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({
        exists: () => false,
      });

      await ratingService.getRating(654, 'movie');

      expect(mockRaceWithTimeout).toHaveBeenCalled();
    });
  });
});
