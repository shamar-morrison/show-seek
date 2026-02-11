import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

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

import { DEFAULT_LISTS, listService } from '@/src/services/ListService';

describe('ListService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset current user to authenticated state
    mockUserId = 'test-user-id';
  });

  describe('addToList', () => {
    it('should update existing list without an initial getDoc read', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('watchlist', mediaItem);

      expect(doc).toHaveBeenCalled();
      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'watchlist',
          'items.123': expect.objectContaining({
            id: 123,
            title: 'Test Movie',
            media_type: 'movie',
            addedAt: expect.any(Number),
          }),
          updatedAt: expect.any(Number),
        })
      );
      expect(setDoc).not.toHaveBeenCalled();
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('should fallback to setDoc with createdAt when updateDoc fails with not-found', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockRejectedValue({ code: 'not-found', message: 'Not found' });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await listService.addToList('watchlist', mediaItem);

      expect(setDoc).toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'watchlist',
          items: expect.objectContaining({
            123: expect.objectContaining({
              id: 123,
              title: 'Test Movie',
              media_type: 'movie',
              addedAt: expect.any(Number),
            }),
          }),
          updatedAt: expect.any(Number),
          createdAt: expect.any(Number),
        }),
        { merge: true }
      );
      expect(getDoc).not.toHaveBeenCalled();
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      const mediaItem = {
        id: 123,
        title: 'Test Movie',
        poster_path: '/poster.jpg',
        media_type: 'movie' as const,
        vote_average: 8.5,
        release_date: '2024-01-01',
      };

      await expect(listService.addToList('watchlist', mediaItem)).rejects.toThrow(
        'Please sign in to continue'
      );
    });
  });

  describe('removeFromList', () => {
    it('should call updateDoc with deleteField for the media item', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', 123);

      expect(updateDoc).toHaveBeenCalledWith(mockDocRef, {
        'items.123': '__deleteField__',
        updatedAt: expect.any(Number),
      });
    });

    it('should throw error when user is not authenticated', async () => {
      mockUserId = null;

      await expect(listService.removeFromList('watchlist', 123)).rejects.toThrow(
        'Please sign in to continue'
      );
    });
  });

  describe('createList', () => {
    it('should create list with URL-friendly ID', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-new-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const listId = await listService.createList('My New List');

      expect(listId).toBe('my-new-list');
      expect(setDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'My New List',
          items: {},
          createdAt: expect.any(Number),
          isCustom: true,
        })
      );
    });

    it('should generate unique ID when collision occurs', async () => {
      const mockDocRef = { path: 'test' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      // First call: exists, second call: doesn't exist
      (getDoc as jest.Mock)
        .mockResolvedValueOnce({ exists: () => true })
        .mockResolvedValueOnce({ exists: () => false });
      (setDoc as jest.Mock).mockResolvedValue(undefined);

      const listId = await listService.createList('Test List');

      // Should have appended a suffix
      expect(listId).toMatch(/^test-list-[a-z0-9]+$/);
    });
  });

  describe('deleteList', () => {
    it('should call deleteDoc for custom lists', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.deleteList('my-custom-list');

      expect(deleteDoc).toHaveBeenCalledWith(mockDocRef);
    });

    it('should prevent deletion of default lists', async () => {
      await expect(listService.deleteList('watchlist')).rejects.toThrow(
        'Cannot delete default lists'
      );
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('DEFAULT_LISTS', () => {
    it('should contain expected default lists', () => {
      expect(DEFAULT_LISTS).toHaveLength(5);
      expect(DEFAULT_LISTS.map((l) => l.id)).toEqual([
        'watchlist',
        'currently-watching',
        'already-watched',
        'favorites',
        'dropped',
      ]);
    });
  });
});
