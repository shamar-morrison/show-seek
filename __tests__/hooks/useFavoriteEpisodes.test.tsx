import { useIsEpisodeFavorited, useToggleFavoriteEpisode } from '@/src/hooks/useFavoriteEpisodes';
import { FavoriteEpisode } from '@/src/types/favoriteEpisode';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetFavoriteEpisodes = jest.fn();
const mockAddFavoriteEpisode = jest.fn();
const mockRemoveFavoriteEpisode = jest.fn();
const mockFirestoreAccessState = {
  user: { uid: 'test-user-id' } as { uid: string } | null,
  signedInUserId: 'test-user-id' as string | undefined,
  firestoreUserId: 'test-user-id' as string | undefined,
  canUseNonCriticalReads: true,
};

const mockAuthState: { user: { uid: string } | null } = {
  user: { uid: 'test-user-id' },
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/useFirestoreAccess', () => ({
  useFirestoreAccess: () => ({
    user: mockFirestoreAccessState.user,
    isAnonymous: false,
    signedInUserId: mockFirestoreAccessState.signedInUserId,
    firestoreUserId: mockFirestoreAccessState.firestoreUserId,
    canUseFirestoreClient: Boolean(mockFirestoreAccessState.firestoreUserId),
    canUseListManagementReads: Boolean(mockFirestoreAccessState.signedInUserId),
    canUseNonCriticalReads: mockFirestoreAccessState.canUseNonCriticalReads,
    canUsePremiumRealtime: Boolean(mockFirestoreAccessState.signedInUserId),
  }),
}));

jest.mock('@/src/services/FavoriteEpisodeService', () => ({
  favoriteEpisodeService: {
    getFavoriteEpisodes: (...args: unknown[]) => mockGetFavoriteEpisodes(...args),
    addFavoriteEpisode: (...args: unknown[]) => mockAddFavoriteEpisode(...args),
    removeFavoriteEpisode: (...args: unknown[]) => mockRemoveFavoriteEpisode(...args),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

const createDeferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

function createWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

const getFavoriteEpisodesKey = (userId = 'test-user-id') => ['favoriteEpisodes', userId] as const;
const getFavoriteEpisodeKey = (episodeId: string, userId = 'test-user-id') =>
  ['favoriteEpisode', userId, episodeId] as const;

const createFavoriteEpisode = (overrides: Partial<FavoriteEpisode> = {}): FavoriteEpisode => ({
  id: '123-1-5',
  tvShowId: 123,
  seasonNumber: 1,
  episodeNumber: 5,
  episodeName: 'Pilot',
  showName: 'Loaded Show',
  posterPath: '/show.jpg',
  addedAt: 1000,
  ...overrides,
});

const toEpisodeData = (episode: FavoriteEpisode): Omit<FavoriteEpisode, 'addedAt'> => {
  const { addedAt, ...episodeData } = episode;
  void addedAt;
  return episodeData;
};

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useFavoriteEpisodes hooks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockFirestoreAccessState.user = { uid: 'test-user-id' };
    mockFirestoreAccessState.signedInUserId = 'test-user-id';
    mockFirestoreAccessState.firestoreUserId = 'test-user-id';
    mockFirestoreAccessState.canUseNonCriticalReads = true;
    mockGetFavoriteEpisodes.mockResolvedValue([]);
    mockAddFavoriteEpisode.mockResolvedValue(undefined);
    mockRemoveFavoriteEpisode.mockResolvedValue(undefined);
  });

  describe('useIsEpisodeFavorited', () => {
    it('should return true for a favorited episode', () => {
      const client = createQueryClient();
      client.setQueryData(getFavoriteEpisodesKey(), [
        createFavoriteEpisode(),
        createFavoriteEpisode({
          id: '456-2-10',
          tvShowId: 456,
          seasonNumber: 2,
          episodeNumber: 10,
        }),
      ]);

      const { result } = renderHook(() => useIsEpisodeFavorited(123, 1, 5), {
        wrapper: createWrapper(client),
      });

      expect(result.current.isFavorited).toBe(true);
      expect(result.current.isLoading).toBe(false);
    });

    it('should return false for an episode not in favorites', () => {
      const client = createQueryClient();
      client.setQueryData(getFavoriteEpisodesKey(), [createFavoriteEpisode()]);

      const { result } = renderHook(() => useIsEpisodeFavorited(123, 1, 6), {
        wrapper: createWrapper(client),
      });

      expect(result.current.isFavorited).toBe(false);
    });

    it('should return false for a different show with same season and episode', () => {
      const client = createQueryClient();
      client.setQueryData(getFavoriteEpisodesKey(), [createFavoriteEpisode()]);

      const { result } = renderHook(() => useIsEpisodeFavorited(789, 1, 5), {
        wrapper: createWrapper(client),
      });

      expect(result.current.isFavorited).toBe(false);
    });
  });

  describe('useToggleFavoriteEpisode', () => {
    it('optimistically adds a favorite episode and invalidates related queries on settle', async () => {
      const client = createQueryClient();
      const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
      const deferred = createDeferred<void>();
      const existing = createFavoriteEpisode({
        id: '111-1-1',
        tvShowId: 111,
        episodeNumber: 1,
        episodeName: 'Existing Episode',
        showName: 'Existing Show',
        addedAt: 500,
      });
      const candidate = createFavoriteEpisode({
        id: '222-2-3',
        tvShowId: 222,
        seasonNumber: 2,
        episodeNumber: 3,
        episodeName: 'New Favorite',
        showName: 'Another Show',
        posterPath: '/another.jpg',
        addedAt: 2000,
      });

      client.setQueryData(getFavoriteEpisodesKey(), [existing]);
      mockAddFavoriteEpisode.mockReturnValueOnce(deferred.promise);

      const { result } = renderHook(() => useToggleFavoriteEpisode(), {
        wrapper: createWrapper(client),
      });

      act(() => {
        result.current.mutate({
          isFavorited: false,
          episodeData: toEpisodeData(candidate),
        });
      });

      await waitFor(() => {
        const cached = client.getQueryData<FavoriteEpisode[]>(getFavoriteEpisodesKey()) ?? [];
        expect(cached.map((episode) => episode.id)).toEqual([candidate.id, existing.id]);
        expect(client.getQueryData(getFavoriteEpisodeKey(candidate.id))).toEqual(
          expect.objectContaining({
            id: candidate.id,
            episodeName: candidate.episodeName,
            addedAt: expect.any(Number),
          })
        );
      });

      await act(async () => {
        deferred.resolve(undefined);
        await deferred.promise;
      });

      await waitFor(() => {
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: getFavoriteEpisodesKey(),
        });
        expect(invalidateSpy).toHaveBeenCalledWith({
          queryKey: getFavoriteEpisodeKey(candidate.id),
        });
      });
    });

    it('optimistically removes a favorite episode while the mutation is pending', async () => {
      const client = createQueryClient();
      const deferred = createDeferred<void>();
      const existing = createFavoriteEpisode({
        id: '111-1-1',
        tvShowId: 111,
        episodeNumber: 1,
      });
      const candidate = createFavoriteEpisode({
        id: '222-2-3',
        tvShowId: 222,
        seasonNumber: 2,
        episodeNumber: 3,
      });

      client.setQueryData(getFavoriteEpisodesKey(), [candidate, existing]);
      client.setQueryData(getFavoriteEpisodeKey(candidate.id), candidate);
      mockRemoveFavoriteEpisode.mockReturnValueOnce(deferred.promise);

      const { result } = renderHook(() => useToggleFavoriteEpisode(), {
        wrapper: createWrapper(client),
      });

      act(() => {
        result.current.mutate({
          isFavorited: true,
          episodeData: toEpisodeData(candidate),
        });
      });

      await waitFor(() => {
        const cached = client.getQueryData<FavoriteEpisode[]>(getFavoriteEpisodesKey()) ?? [];
        expect(cached.map((episode) => episode.id)).toEqual([existing.id]);
        expect(client.getQueryData(getFavoriteEpisodeKey(candidate.id))).toBeNull();
      });

      await act(async () => {
        deferred.resolve(undefined);
        await deferred.promise;
      });
    });

    it('rolls back an optimistic add when the mutation fails', async () => {
      const client = createQueryClient();
      const existing = createFavoriteEpisode({
        id: '111-1-1',
        tvShowId: 111,
      });
      const candidate = createFavoriteEpisode({
        id: '222-2-3',
        tvShowId: 222,
        seasonNumber: 2,
        episodeNumber: 3,
      });

      client.setQueryData(getFavoriteEpisodesKey(), [existing]);
      mockAddFavoriteEpisode.mockRejectedValueOnce(new Error('add failed'));

      const { result } = renderHook(() => useToggleFavoriteEpisode(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            isFavorited: false,
            episodeData: toEpisodeData(candidate),
          })
        ).rejects.toThrow('add failed');
      });

      await waitFor(() => {
        const cached = client.getQueryData<FavoriteEpisode[]>(getFavoriteEpisodesKey()) ?? [];
        expect(cached.map((episode) => episode.id)).toEqual([existing.id]);
        expect(client.getQueryData(getFavoriteEpisodeKey(candidate.id))).toBeNull();
      });
    });

    it('rolls back an optimistic removal when the mutation fails', async () => {
      const client = createQueryClient();
      const existing = createFavoriteEpisode({
        id: '111-1-1',
        tvShowId: 111,
      });
      const candidate = createFavoriteEpisode({
        id: '222-2-3',
        tvShowId: 222,
        seasonNumber: 2,
        episodeNumber: 3,
      });

      client.setQueryData(getFavoriteEpisodesKey(), [candidate, existing]);
      client.setQueryData(getFavoriteEpisodeKey(candidate.id), candidate);
      mockRemoveFavoriteEpisode.mockRejectedValueOnce(new Error('remove failed'));

      const { result } = renderHook(() => useToggleFavoriteEpisode(), {
        wrapper: createWrapper(client),
      });

      await act(async () => {
        await expect(
          result.current.mutateAsync({
            isFavorited: true,
            episodeData: toEpisodeData(candidate),
          })
        ).rejects.toThrow('remove failed');
      });

      await waitFor(() => {
        const cached = client.getQueryData<FavoriteEpisode[]>(getFavoriteEpisodesKey()) ?? [];
        expect(cached.map((episode) => episode.id)).toEqual([candidate.id, existing.id]);
        expect(client.getQueryData(getFavoriteEpisodeKey(candidate.id))).toEqual(candidate);
      });
    });
  });
});
