import { favoriteEpisodeService } from '@/src/services/FavoriteEpisodeService';
import { deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore';

// Create module-level mutable mock state
let mockUserId: string | null = 'test-user-id';
let mockIsAnonymous = false;

// Mock the firebase config
jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId, isAnonymous: mockIsAnonymous } : null;
    },
  },
  db: {},
}));

// Mock firestore error helper
jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

describe('FavoriteEpisodeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    mockIsAnonymous = false;
  });

  describe('addFavoriteEpisode', () => {
    it('should call setDoc with correct episode data', async () => {
      const mockDocRef = { path: 'users/test-user-id/favorite_episodes/123-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const episodeData = {
        id: '123-1-5',
        tvShowId: 123,
        seasonNumber: 1,
        episodeNumber: 5,
        episodeName: 'Test Episode',
        showName: 'Test Show',
        posterPath: '/path.jpg',
      };

      await favoriteEpisodeService.addFavoriteEpisode('test-user-id', episodeData);

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'test-user-id',
        'favorite_episodes',
        '123-1-5'
      );
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          ...episodeData,
          addedAt: expect.any(Number),
        })
      );
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;
      await expect(
        favoriteEpisodeService.addFavoriteEpisode('test-user-id', { id: '1-1-1' } as any)
      ).rejects.toThrow('Please sign in to continue');
    });
  });

  describe('removeFavoriteEpisode', () => {
    it('should call deleteDoc with correct reference', async () => {
      const mockDocRef = { path: 'users/test-user-id/favorite_episodes/123-1-5' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await favoriteEpisodeService.removeFavoriteEpisode('test-user-id', '123-1-5');

      expect(doc).toHaveBeenCalledWith(
        expect.anything(),
        'users',
        'test-user-id',
        'favorite_episodes',
        '123-1-5'
      );
      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });
  });

  describe('getFavoriteEpisodes', () => {
    it('should return all favorite episodes', async () => {
      const mockEpisodes = [
        { id: '1-1-1', showName: 'Show 1', addedAt: 1000 },
        { id: '1-1-2', showName: 'Show 1', addedAt: 2000 },
      ];
      const mockSnapshot = {
        docs: mockEpisodes.map((ep) => ({ data: () => ep })),
      };
      (getDocs as jest.Mock).mockResolvedValue(mockSnapshot);

      const result = await favoriteEpisodeService.getFavoriteEpisodes('test-user-id');

      expect(result).toEqual(mockEpisodes);
      expect(getDocs).toHaveBeenCalled();
    });

    it('returns an empty array for unauthenticated users without querying Firestore', async () => {
      mockUserId = null;

      const result = await favoriteEpisodeService.getFavoriteEpisodes('test-user-id');

      expect(result).toEqual([]);
      expect(getDocs).not.toHaveBeenCalled();
    });

    it('returns an empty array for anonymous users without querying Firestore', async () => {
      mockIsAnonymous = true;

      const result = await favoriteEpisodeService.getFavoriteEpisodes('test-user-id');

      expect(result).toEqual([]);
      expect(getDocs).not.toHaveBeenCalled();
    });
  });

  describe('getFavoriteEpisode', () => {
    it('returns null for unauthorized users without querying Firestore', async () => {
      mockUserId = 'another-user-id';

      const result = await favoriteEpisodeService.getFavoriteEpisode('test-user-id', '1-1-1');

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('returns null for anonymous users without querying Firestore', async () => {
      mockIsAnonymous = true;

      const result = await favoriteEpisodeService.getFavoriteEpisode('test-user-id', '1-1-1');

      expect(result).toBeNull();
      expect(getDoc).not.toHaveBeenCalled();
    });
  });
});
