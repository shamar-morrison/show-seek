import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';

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
    jest.useFakeTimers();
    (doc as jest.Mock).mockReturnValue({ path: 'users/test-user-id/collection_tracking/123' });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back on timeout when no snapshot event arrives', () => {
    const callback = jest.fn();
    const onError = jest.fn();
    const unsubscribe = jest.fn();

    (onSnapshot as jest.Mock).mockReturnValue(unsubscribe);

    collectionTrackingService.subscribeToTrackedCollections(callback, onError);

    jest.advanceTimersByTime(10000);

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
    expect(callback).toHaveBeenCalledWith([]);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
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
