import { doc, getDoc, updateDoc } from 'firebase/firestore';

let mockUserId: string | null = 'test-user-id';

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockUserId ? { uid: mockUserId } : null;
    },
  },
  db: {},
}));

jest.mock('@/src/firebase/firestore', () => ({
  getFirestoreErrorMessage: jest.fn((error) => error.message || 'Unknown error'),
}));

import { collectionTrackingService } from '@/src/services/CollectionTrackingService';

describe('CollectionTrackingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUserId = 'test-user-id';
    (doc as jest.Mock).mockReturnValue({ path: 'users/test-user-id/collection_tracking/123' });
  });

  it('returns tracked collection when document exists', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => true,
      data: () => ({
        collectionId: 123,
        name: 'Test Collection',
        totalMovies: 4,
        watchedMovieIds: [11, 22],
        startedAt: 100,
        lastUpdated: 200,
      }),
    });

    await expect(collectionTrackingService.getCollectionTracking(123)).resolves.toEqual({
      collectionId: 123,
      name: 'Test Collection',
      totalMovies: 4,
      watchedMovieIds: [11, 22],
      startedAt: 100,
      lastUpdated: 200,
    });
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it('returns null when tracked collection document does not exist', async () => {
    (getDoc as jest.Mock).mockResolvedValue({
      exists: () => false,
    });

    await expect(collectionTrackingService.getCollectionTracking(123)).resolves.toBeNull();
    expect(getDoc).toHaveBeenCalledTimes(1);
  });

  it('updates tracked collection directly when adding watched movies (no getDoc)', async () => {
    (updateDoc as jest.Mock).mockResolvedValue(undefined);

    await collectionTrackingService.addWatchedMovie(123, 456);

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        watchedMovieIds: '__arrayUnion__456',
        lastUpdated: expect.any(Number),
      })
    );
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('no-ops when adding watched movie to a non-existent tracked collection', async () => {
    (updateDoc as jest.Mock).mockRejectedValue({ code: 'not-found', message: 'Not found' });

    await expect(collectionTrackingService.addWatchedMovie(123, 456)).resolves.toBeUndefined();
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('updates tracked collection directly when removing watched movies (no getDoc)', async () => {
    (updateDoc as jest.Mock).mockResolvedValue(undefined);

    await collectionTrackingService.removeWatchedMovie(123, 456);

    expect(updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        watchedMovieIds: '__arrayRemove__456',
        lastUpdated: expect.any(Number),
      })
    );
    expect(getDoc).not.toHaveBeenCalled();
  });

  it('no-ops when removing watched movie from a non-existent tracked collection', async () => {
    (updateDoc as jest.Mock).mockRejectedValue({ code: 'not-found', message: 'Not found' });

    await expect(collectionTrackingService.removeWatchedMovie(123, 456)).resolves.toBeUndefined();
    expect(getDoc).not.toHaveBeenCalled();
  });
});
