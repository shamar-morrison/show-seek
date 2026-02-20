import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetAllTrackedCollections = jest.fn();
const mockGetCollectionTracking = jest.fn();
const mockGetPreviouslyWatchedMovieIds = jest.fn();
const mockStartTracking = jest.fn();
const mockCreateTimeoutWithCleanup = jest.fn();

const mockAuthState: { currentUser: { uid: string } | null } = {
  currentUser: { uid: 'test-user-id' },
};

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockAuthState.currentUser;
    },
  },
  db: {},
}));

jest.mock('@/src/context/PremiumContext', () => ({
  usePremium: () => ({ isPremium: false }),
}));

jest.mock('@/src/utils/timeout', () => ({
  createTimeoutWithCleanup: (...args: unknown[]) => mockCreateTimeoutWithCleanup(...args),
}));

jest.mock('@/src/services/CollectionTrackingService', () => ({
  collectionTrackingService: {
    getAllTrackedCollections: (...args: unknown[]) => mockGetAllTrackedCollections(...args),
    getCollectionTracking: (...args: unknown[]) => mockGetCollectionTracking(...args),
    getPreviouslyWatchedMovieIds: (...args: unknown[]) =>
      mockGetPreviouslyWatchedMovieIds(...args),
    getTrackedCollectionCount: jest.fn(),
    startTracking: (...args: unknown[]) => mockStartTracking(...args),
    stopTracking: jest.fn(),
    addWatchedMovie: jest.fn(),
    removeWatchedMovie: jest.fn(),
  },
  MAX_FREE_COLLECTIONS: 2,
}));

import {
  useCollectionTracking,
  useStartCollectionTracking,
  useTrackedCollections,
} from '@/src/hooks/useCollectionTracking';

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useCollectionTracking hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.currentUser = { uid: 'test-user-id' };
    mockCreateTimeoutWithCleanup.mockImplementation(() => ({
      promise: new Promise<never>(() => {}),
      cancel: jest.fn(),
    }));
  });

  it('loads tracked collections with query caching', async () => {
    mockGetAllTrackedCollections.mockResolvedValueOnce([
      {
        collectionId: 10,
        name: 'John Wick Collection',
        totalMovies: 4,
        watchedMovieIds: [1, 2],
        startedAt: 1000,
        lastUpdated: 2000,
      },
    ]);

    const client = createQueryClient();
    const { result } = renderHook(() => useTrackedCollections(), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.collections).toHaveLength(1);
    });

    expect(mockGetAllTrackedCollections).toHaveBeenCalledTimes(1);
    expect(result.current.collections[0].collectionId).toBe(10);
  });

  it('loads a single tracked collection and derives progress fields', async () => {
    mockGetCollectionTracking.mockResolvedValueOnce({
      collectionId: 12,
      name: 'Batman Collection',
      totalMovies: 5,
      watchedMovieIds: [11, 22, 33],
      startedAt: 100,
      lastUpdated: 200,
    });

    const client = createQueryClient();
    const { result } = renderHook(() => useCollectionTracking(12), {
      wrapper: createWrapper(client),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isTracked).toBe(true);
    });

    expect(mockGetCollectionTracking).toHaveBeenCalledWith(12);
    expect(result.current.watchedCount).toBe(3);
    expect(result.current.totalMovies).toBe(5);
    expect(result.current.percentage).toBe(60);
  });

  it('does not fetch when signed out', () => {
    mockAuthState.currentUser = null;

    const client = createQueryClient();
    const { result } = renderHook(() => useCollectionTracking(50), {
      wrapper: createWrapper(client),
    });

    expect(mockGetCollectionTracking).not.toHaveBeenCalled();
    expect(result.current.tracking).toBeNull();
    expect(result.current.isTracked).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  it('backfills initial watched IDs when starting tracking with collection movie IDs', async () => {
    mockGetPreviouslyWatchedMovieIds.mockResolvedValueOnce([11, 33]);
    mockStartTracking.mockResolvedValueOnce(undefined);

    const client = createQueryClient();
    const { result } = renderHook(() => useStartCollectionTracking(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        collectionId: 7,
        name: 'Mission Impossible Collection',
        totalMovies: 4,
        collectionMovieIds: [11, 22, 33],
      });
    });

    expect(mockGetPreviouslyWatchedMovieIds).toHaveBeenCalledWith([11, 22, 33]);
    expect(mockStartTracking).toHaveBeenCalledWith(
      7,
      'Mission Impossible Collection',
      4,
      [11, 33]
    );
  });

  it('falls back to empty initial progress if watched-history backfill fails', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    mockGetPreviouslyWatchedMovieIds.mockRejectedValueOnce(new Error('backfill failed'));
    mockStartTracking.mockResolvedValueOnce(undefined);

    const client = createQueryClient();
    const { result } = renderHook(() => useStartCollectionTracking(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        collectionId: 8,
        name: 'Alien Collection',
        totalMovies: 6,
        collectionMovieIds: [1, 2, 3],
      });
    });

    expect(mockGetPreviouslyWatchedMovieIds).toHaveBeenCalledWith([1, 2, 3]);
    expect(mockStartTracking).toHaveBeenCalledWith(8, 'Alien Collection', 6, []);

    warnSpy.mockRestore();
  });

  it('uses explicit initial watched IDs without backfill lookup', async () => {
    mockStartTracking.mockResolvedValueOnce(undefined);

    const client = createQueryClient();
    const { result } = renderHook(() => useStartCollectionTracking(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        collectionId: 9,
        name: 'Toy Story Collection',
        totalMovies: 4,
        collectionMovieIds: [10, 20, 30],
        initialWatchedMovieIds: [20],
      });
    });

    expect(mockGetPreviouslyWatchedMovieIds).not.toHaveBeenCalled();
    expect(mockStartTracking).toHaveBeenCalledWith(9, 'Toy Story Collection', 4, [20]);
  });

  it('uses empty initial watched IDs when no backfill inputs are provided', async () => {
    mockStartTracking.mockResolvedValueOnce(undefined);

    const client = createQueryClient();
    const { result } = renderHook(() => useStartCollectionTracking(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        collectionId: 10,
        name: 'The Matrix Collection',
        totalMovies: 4,
      });
    });

    expect(mockGetPreviouslyWatchedMovieIds).not.toHaveBeenCalled();
    expect(mockStartTracking).toHaveBeenCalledWith(10, 'The Matrix Collection', 4, []);
  });

  it('falls back to empty initial progress when overall backfill timeout is reached', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation();
    const cancelSpy = jest.fn();

    mockCreateTimeoutWithCleanup.mockReturnValueOnce({
      promise: Promise.reject(new Error('Backfill watched history timed out')),
      cancel: cancelSpy,
    });
    mockGetPreviouslyWatchedMovieIds.mockImplementation(() => new Promise<number[]>(() => {}));
    mockStartTracking.mockResolvedValueOnce(undefined);

    const client = createQueryClient();
    const { result } = renderHook(() => useStartCollectionTracking(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await result.current.mutateAsync({
        collectionId: 11,
        name: 'Terminator Collection',
        totalMovies: 6,
        collectionMovieIds: [101, 102, 103],
      });
    });

    expect(mockGetPreviouslyWatchedMovieIds).toHaveBeenCalledWith([101, 102, 103]);
    expect(mockStartTracking).toHaveBeenCalledWith(11, 'Terminator Collection', 6, []);
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
