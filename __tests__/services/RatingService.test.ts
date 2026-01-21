import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

// Create module-level mutable mock state
let mockUserId: string | null = 'test-user-id';

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

import { ratingService } from '@/src/services/RatingService';

describe('RatingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset current user to authenticated state
    mockUserId = 'test-user-id';
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
});
