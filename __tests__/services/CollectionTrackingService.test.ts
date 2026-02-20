import { collection, doc, getDoc, getDocs, limit, query, updateDoc } from 'firebase/firestore';

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

const createGetDocsSnapshot = (empty: boolean) => ({
  empty,
  size: empty ? 0 : 1,
  docs: empty ? [] : [{}],
});

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

  it('returns watched movie IDs from history checks in input order', async () => {
    (collection as jest.Mock).mockImplementation((_db, ...segments: string[]) => ({
      path: segments.join('/'),
    }));
    (limit as jest.Mock).mockImplementation((value: number) => ({ type: 'limit', value }));
    (query as jest.Mock).mockImplementation((ref: { path: string }, ...constraints: unknown[]) => ({
      ref,
      constraints,
    }));
    (getDocs as jest.Mock).mockImplementation(({ ref }: { ref: { path: string } }) => {
      if (
        ref.path === 'users/test-user-id/watched_movies/101/watches' ||
        ref.path === 'users/test-user-id/watched_movies/303/watches'
      ) {
        return Promise.resolve(createGetDocsSnapshot(false));
      }

      return Promise.resolve(createGetDocsSnapshot(true));
    });

    await expect(
      collectionTrackingService.getPreviouslyWatchedMovieIds([101, 202, 303])
    ).resolves.toEqual([101, 303]);
    expect(getDocs).toHaveBeenCalledTimes(3);
    expect(limit).toHaveBeenCalledWith(1);
  });

  it('de-duplicates and sanitizes movie IDs before checking watch history', async () => {
    (collection as jest.Mock).mockImplementation((_db, ...segments: string[]) => ({
      path: segments.join('/'),
    }));
    (limit as jest.Mock).mockImplementation((value: number) => ({ type: 'limit', value }));
    (query as jest.Mock).mockImplementation((ref: { path: string }, ...constraints: unknown[]) => ({
      ref,
      constraints,
    }));
    (getDocs as jest.Mock).mockResolvedValue(createGetDocsSnapshot(true));

    await expect(
      collectionTrackingService.getPreviouslyWatchedMovieIds([10, 10, -4, 0, 8.5, 12, NaN, 12])
    ).resolves.toEqual([]);

    const requestedPaths = (collection as jest.Mock).mock.calls.map(([, ...segments]) =>
      segments.join('/')
    );
    expect(requestedPaths).toEqual([
      'users/test-user-id/watched_movies/10/watches',
      'users/test-user-id/watched_movies/12/watches',
    ]);
    expect(getDocs).toHaveBeenCalledTimes(2);
  });

  it('returns empty watched IDs when unauthenticated', async () => {
    mockUserId = null;

    await expect(collectionTrackingService.getPreviouslyWatchedMovieIds([10, 20])).resolves.toEqual(
      []
    );
    expect(getDocs).not.toHaveBeenCalled();
  });
});
