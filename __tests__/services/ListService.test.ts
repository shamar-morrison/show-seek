import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';

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

const mockTimeoutCancel = jest.fn();
const mockCreateTimeoutWithCleanup = jest.fn((_ms?: number, _message?: string) => ({
  promise: new Promise<never>(() => {}),
  cancel: mockTimeoutCancel,
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeoutWithCleanup: (ms?: number, message?: string) =>
    mockCreateTimeoutWithCleanup(ms, message),
}));

import { DEFAULT_LISTS, listService } from '@/src/services/ListService';
import {
  clearFirestoreReadAuditEvents,
  getFirestoreReadAuditReport,
} from '@/src/services/firestoreReadAudit';

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

    it('returns a friendly error when collision checks time out', async () => {
      const collisionTimeoutCancel = jest.fn();
      (doc as jest.Mock).mockReturnValue({ path: 'users/test-user-id/lists/timeout-list' });
      (getDoc as jest.Mock).mockReturnValue(new Promise(() => {}));
      mockCreateTimeoutWithCleanup.mockImplementationOnce(() => ({
        promise: Promise.reject(new Error('List creation collision check timed out')),
        cancel: collisionTimeoutCancel,
      }));

      await expect(listService.createList('Timeout List')).rejects.toThrow(
        'Unable to create list right now, please try again'
      );
      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalledWith(
        10000,
        'List creation collision check timed out'
      );
      expect(collisionTimeoutCancel).toHaveBeenCalledTimes(1);
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

  describe('renameList', () => {
    it('updates list name and description for custom lists', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => true });
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.renameList('my-custom-list', 'Renamed List', 'Updated description');

      expect(updateDoc).toHaveBeenCalledWith(
        mockDocRef,
        expect.objectContaining({
          name: 'Renamed List',
          description: 'Updated description',
          updatedAt: expect.any(Number),
        })
      );
    });

    it('throws when list does not exist', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/missing-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

      await expect(listService.renameList('missing-list', 'Renamed')).rejects.toThrow('List not found');
      expect(updateDoc).not.toHaveBeenCalled();
    });
  });

  describe('timeout cleanup', () => {
    it('cancels timeout after removeFromList resolves', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/watchlist' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (updateDoc as jest.Mock).mockResolvedValue(undefined);

      await listService.removeFromList('watchlist', 123);

      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalled();
      expect(mockTimeoutCancel).toHaveBeenCalled();
    });

    it('cancels timeout when deleteList throws', async () => {
      const mockDocRef = { path: 'users/test-user-id/lists/my-custom-list' };
      (doc as jest.Mock).mockReturnValue(mockDocRef);
      (deleteDoc as jest.Mock).mockRejectedValueOnce(new Error('delete failed'));

      await expect(listService.deleteList('my-custom-list')).rejects.toThrow('delete failed');
      expect(mockCreateTimeoutWithCleanup).toHaveBeenCalled();
      expect(mockTimeoutCancel).toHaveBeenCalled();
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

  describe('getListMembershipIndex', () => {
    it('builds a complete membership index and records a single audited fetch', async () => {
      const mockCollectionRef = { path: 'users/test-user-id/lists' };
      (collection as jest.Mock).mockReturnValue(mockCollectionRef);

      const mockSnapshot = {
        size: 6,
        docs: [
          {
            id: 'watchlist',
            data: () => ({
              items: {
                101: { id: 101, media_type: 'movie' },
                202: { id: 202, media_type: 'tv' },
              },
            }),
          },
          {
            id: 'favorites',
            data: () => ({
              items: {
                101: { id: 101, media_type: 'movie' },
              },
            }),
          },
          {
            id: 'custom-1',
            data: () => ({
              items: {
                303: { id: 303, media_type: 'movie' },
              },
            }),
          },
          { id: 'currently-watching', data: () => ({ items: {} }) },
          { id: 'already-watched', data: () => ({ items: {} }) },
          { id: 'dropped', data: () => ({ items: {} }) },
        ],
      };

      (getDocs as jest.Mock).mockResolvedValue(mockSnapshot);
      clearFirestoreReadAuditEvents();

      const membership = await listService.getListMembershipIndex('test-user-id');

      expect(membership).toEqual({
        '101-movie': ['watchlist', 'favorites'],
        '202-tv': ['watchlist'],
        '303-movie': ['custom-1'],
      });
      expect(getDocs).toHaveBeenCalledTimes(1);

      const report = getFirestoreReadAuditReport();
      const membershipCallsite = report.byCallsite.find(
        (entry) => entry.name === 'ListService.getListMembershipIndex'
      );

      expect(membershipCallsite?.reads).toBe(6);
      expect(report.byOperation.find((entry) => entry.name === 'getDocs')?.reads).toBe(6);
      expect(report.byPath.find((entry) => entry.name === 'users/test-user-id/lists')?.reads).toBe(
        6
      );
    });
  });
});
