import { collectionTrackingService } from '@/src/services/CollectionTrackingService';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';
import { auth } from '@/src/firebase/config';
import { collection, deleteDoc, doc, getDocs, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import {
  useAddWatch,
  useClearWatches,
  useDeleteWatch,
  useUpdateWatchDate,
} from '@/src/hooks/useWatchedMovies';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  deleteDoc: jest.fn(),
  updateDoc: jest.fn(),
  writeBatch: jest.fn(),
  Timestamp: {
    fromDate: jest.fn((date: Date) => ({ toDate: () => date })),
  },
}));

jest.mock('@/src/services/CollectionTrackingService', () => ({
  collectionTrackingService: {
    getAllTrackedCollections: jest.fn(),
    removeWatchedMovie: jest.fn(),
  },
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeout: jest.fn(() => new Promise<never>(() => {})),
}));

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function createSnapshot(docs: Array<{ ref: { id: string } }>) {
  return {
    empty: docs.length === 0,
    docs,
  };
}

async function captureMutationError(runMutation: () => Promise<unknown>) {
  let thrown: unknown;

  await act(async () => {
    try {
      await runMutation();
    } catch (error) {
      thrown = error;
    }
  });

  return thrown;
}

describe('useWatchedMovies mutations', () => {
  const mockBatchDelete = jest.fn();
  const mockBatchCommit = jest.fn();

  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (auth as any).currentUser = {
      uid: 'test-user-id',
      email: 'test@example.com',
      isAnonymous: false,
    };
    (collection as jest.Mock).mockImplementation((_db, path) => ({ path }));
    (doc as jest.Mock).mockImplementation((_db, path) => ({ path }));
    (setDoc as jest.Mock).mockResolvedValue(undefined);
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
    (updateDoc as jest.Mock).mockResolvedValue(undefined);
    (writeBatch as jest.Mock).mockReturnValue({
      delete: mockBatchDelete,
      commit: mockBatchCommit.mockResolvedValue(undefined),
    });
  });

  it('uses the same watch ID for Firestore writes and optimistic cache entries', async () => {
    const client = createQueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const watchedAt = new Date('2026-03-09T12:00:00.000Z');
    const watchId = 'watch-123';

    const { result } = renderHook(() => useAddWatch(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({ watchedAt, watchId });
    });

    expect(setDoc).toHaveBeenCalledWith(
      { path: 'users/test-user-id/watched_movies/999/watches/watch-123' },
      {
        watchedAt: expect.any(Object),
        movieId: 999,
      }
    );
    expect(client.getQueryData(['watchedMovies', 'test-user-id', 999])).toEqual([
      {
        id: 'watch-123',
        watchedAt,
        movieId: 999,
      },
    ]);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['watchedMovies', 'test-user-id', 999],
    });
  });

  it('updates the same watch document after an add without using a temporary ID', async () => {
    const client = createQueryClient();
    const initialDate = new Date('2026-03-09T12:00:00.000Z');
    const updatedDate = new Date('2026-03-10T15:30:00.000Z');
    const watchId = 'watch-456';

    const { result: addResult } = renderHook(() => useAddWatch(999), {
      wrapper: createWrapper(client),
    });
    const { result: updateResult } = renderHook(() => useUpdateWatchDate(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await addResult.current.mutateAsync({ watchedAt: initialDate, watchId });
    });

    const cachedInstances = client.getQueryData<any[]>(['watchedMovies', 'test-user-id', 999]) ?? [];

    await act(async () => {
      await updateResult.current.mutateAsync({
        instanceId: cachedInstances[0].id,
        newDate: updatedDate,
      });
    });

    expect(cachedInstances[0].id).toBe('watch-456');
    expect(doc).toHaveBeenCalledWith(
      expect.anything(),
      'users/test-user-id/watched_movies/999/watches/watch-456'
    );
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'users/test-user-id/watched_movies/999/watches/watch-456' },
      {
        watchedAt: expect.any(Object),
      }
    );
  });

  it('syncs tracked collections after clearing non-empty watch history', async () => {
    const client = createQueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    (getDocs as jest.Mock).mockResolvedValueOnce(
      createSnapshot([{ ref: { id: 'watch-1' } }, { ref: { id: 'watch-2' } }])
    );
    (collectionTrackingService.getAllTrackedCollections as jest.Mock).mockResolvedValue([
      {
        collectionId: 1,
        watchedMovieIds: [10, 999],
      },
      {
        collectionId: 2,
        watchedMovieIds: [999],
      },
      {
        collectionId: 3,
        watchedMovieIds: [5],
      },
    ]);
    (collectionTrackingService.removeWatchedMovie as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useClearWatches(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(mockBatchDelete).toHaveBeenCalledTimes(2);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(collectionTrackingService.getAllTrackedCollections).toHaveBeenCalledTimes(1);
    expect(collectionTrackingService.removeWatchedMovie).toHaveBeenCalledTimes(2);
    expect(collectionTrackingService.removeWatchedMovie).toHaveBeenCalledWith(1, 999);
    expect(collectionTrackingService.removeWatchedMovie).toHaveBeenCalledWith(2, 999);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collectionTracking'] });
  });

  it('does not sync collections when clearing already-empty watch history', async () => {
    const client = createQueryClient();
    (getDocs as jest.Mock).mockResolvedValueOnce(createSnapshot([]));

    const { result } = renderHook(() => useClearWatches(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(writeBatch).not.toHaveBeenCalled();
    expect(collectionTrackingService.getAllTrackedCollections).not.toHaveBeenCalled();
    expect(collectionTrackingService.removeWatchedMovie).not.toHaveBeenCalled();
  });

  it('syncs tracked collections when deleting the final watch instance', async () => {
    const client = createQueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    (getDocs as jest.Mock).mockResolvedValueOnce(createSnapshot([]));
    (collectionTrackingService.getAllTrackedCollections as jest.Mock).mockResolvedValue([
      {
        collectionId: 77,
        watchedMovieIds: [999],
      },
    ]);
    (collectionTrackingService.removeWatchedMovie as jest.Mock).mockResolvedValue(undefined);

    const { result } = renderHook(() => useDeleteWatch(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('watch-1');
    });

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(getDocs).toHaveBeenCalledTimes(1);
    expect(collectionTrackingService.getAllTrackedCollections).toHaveBeenCalledTimes(1);
    expect(collectionTrackingService.removeWatchedMovie).toHaveBeenCalledWith(77, 999);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['collectionTracking'] });
  });

  it('does not sync tracked collections when deleting a non-final watch instance', async () => {
    const client = createQueryClient();
    (getDocs as jest.Mock).mockResolvedValueOnce(createSnapshot([{ ref: { id: 'remaining' } }]));

    const { result } = renderHook(() => useDeleteWatch(999), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync('watch-1');
    });

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(collectionTrackingService.getAllTrackedCollections).not.toHaveBeenCalled();
    expect(collectionTrackingService.removeWatchedMovie).not.toHaveBeenCalled();
  });

  it('keeps watch removal successful when collection sync fails', async () => {
    const client = createQueryClient();
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    (getDocs as jest.Mock).mockResolvedValueOnce(createSnapshot([{ ref: { id: 'watch-1' } }]));
    (collectionTrackingService.getAllTrackedCollections as jest.Mock).mockResolvedValue([
      {
        collectionId: 11,
        watchedMovieIds: [999],
      },
    ]);
    (collectionTrackingService.removeWatchedMovie as jest.Mock).mockRejectedValue(
      new Error('sync failed')
    );

    const { result } = renderHook(() => useClearWatches(999), {
      wrapper: createWrapper(client),
    });

    const thrown = await captureMutationError(() => result.current.mutateAsync());

    expect(thrown).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('rejects watched-movie mutations for anonymous users before reaching Firestore', async () => {
    const client = createQueryClient();
    (auth as any).currentUser = {
      uid: 'guest-user',
      email: 'guest@example.com',
      isAnonymous: true,
    };

    const { result: addResult } = renderHook(() => useAddWatch(999), {
      wrapper: createWrapper(client),
    });
    const { result: clearResult } = renderHook(() => useClearWatches(999), {
      wrapper: createWrapper(client),
    });
    const { result: deleteResult } = renderHook(() => useDeleteWatch(999), {
      wrapper: createWrapper(client),
    });
    const { result: updateResult } = renderHook(() => useUpdateWatchDate(999), {
      wrapper: createWrapper(client),
    });

    const addError = await captureMutationError(() =>
      addResult.current.mutateAsync({
        watchedAt: new Date('2026-03-09T12:00:00.000Z'),
        watchId: 'guest-watch',
      })
    );
    const clearError = await captureMutationError(() => clearResult.current.mutateAsync());
    const deleteError = await captureMutationError(() =>
      deleteResult.current.mutateAsync('watch-1')
    );
    const updateError = await captureMutationError(() =>
      updateResult.current.mutateAsync({
        instanceId: 'watch-1',
        newDate: new Date('2026-03-10T15:30:00.000Z'),
      })
    );

    expect((addError as Error | undefined)?.message).toBe('Please sign in to continue');
    expect((clearError as Error | undefined)?.message).toBe('Please sign in to continue');
    expect((deleteError as Error | undefined)?.message).toBe('Please sign in to continue');
    expect((updateError as Error | undefined)?.message).toBe('Please sign in to continue');
    expect(setDoc).not.toHaveBeenCalled();
    expect(getDocs).not.toHaveBeenCalled();
    expect(deleteDoc).not.toHaveBeenCalled();
    expect(updateDoc).not.toHaveBeenCalled();
    expect(writeBatch).not.toHaveBeenCalled();
  });
});
