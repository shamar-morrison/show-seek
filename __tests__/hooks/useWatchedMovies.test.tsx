import { collectionTrackingService } from '@/src/services/CollectionTrackingService';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';
import { collection, deleteDoc, doc, getDocs, writeBatch } from 'firebase/firestore';
import { useClearWatches, useDeleteWatch } from '@/src/hooks/useWatchedMovies';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
  deleteDoc: jest.fn(),
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

describe('useWatchedMovies collection tracking sync', () => {
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

    (collection as jest.Mock).mockImplementation((_db, path) => ({ path }));
    (doc as jest.Mock).mockImplementation((_db, path) => ({ path }));
    (deleteDoc as jest.Mock).mockResolvedValue(undefined);
    (writeBatch as jest.Mock).mockReturnValue({
      delete: mockBatchDelete,
      commit: mockBatchCommit.mockResolvedValue(undefined),
    });
  });

  it('syncs tracked collections after clearing non-empty watch history', async () => {
    const client = createQueryClient();
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

    let thrown: unknown;
    await act(async () => {
      try {
        await result.current.mutateAsync();
      } catch (error) {
        thrown = error;
      }
    });

    expect(thrown).toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
