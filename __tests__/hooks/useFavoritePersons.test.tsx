import { useAddFavoritePerson, useRemoveFavoritePerson } from '@/src/hooks/useFavoritePersons';
import { FavoritePerson } from '@/src/types/favoritePerson';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockGetFavoritePersons = jest.fn();
const mockAddFavoritePerson = jest.fn();
const mockRemoveFavoritePerson = jest.fn();

const mockAuthState: { user: { uid: string } | null } = {
  user: { uid: 'test-user-id' },
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/services/FavoritePersonsService', () => ({
  favoritePersonsService: {
    getFavoritePersons: (...args: unknown[]) => mockGetFavoritePersons(...args),
    addFavoritePerson: (...args: unknown[]) => mockAddFavoritePerson(...args),
    removeFavoritePerson: (...args: unknown[]) => mockRemoveFavoritePerson(...args),
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

const getFavoritePersonsKey = (userId = 'test-user-id') => ['favoritePersons', userId] as const;

const createFavoritePerson = (id: number, name: string): FavoritePerson => ({
  id,
  name,
  profile_path: null,
  known_for_department: 'Acting',
  addedAt: Date.now(),
});

beforeAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => act(fn));
});

afterAll(() => {
  notifyManager.setNotifyFunction((fn: () => void) => fn());
});

describe('useFavoritePersons optimistic mutations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockGetFavoritePersons.mockResolvedValue([]);
    mockAddFavoritePerson.mockResolvedValue(undefined);
    mockRemoveFavoritePerson.mockResolvedValue(undefined);
  });

  it('optimistically appends favorite person and invalidates list on settle', async () => {
    const client = createQueryClient();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
    const deferred = createDeferred<void>();
    const existing = createFavoritePerson(1, 'Existing');
    const candidate = {
      id: 2,
      name: 'New Person',
      profile_path: '/new.jpg',
      known_for_department: 'Directing',
    };

    client.setQueryData(getFavoritePersonsKey(), [existing]);
    mockAddFavoritePerson.mockReturnValueOnce(deferred.promise);

    const { result } = renderHook(() => useAddFavoritePerson(), {
      wrapper: createWrapper(client),
    });

    act(() => {
      result.current.mutate({ personData: candidate });
    });

    await waitFor(() => {
      const cached = client.getQueryData<FavoritePerson[]>(getFavoritePersonsKey()) ?? [];
      expect(cached.some((person) => person.id === candidate.id)).toBe(true);
    });

    await act(async () => {
      deferred.resolve(undefined);
      await deferred.promise;
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: getFavoritePersonsKey(),
      });
    });
  });

  it('rolls back optimistic add when mutation fails', async () => {
    const client = createQueryClient();
    const existing = createFavoritePerson(1, 'Existing');
    const candidate = {
      id: 2,
      name: 'Broken Person',
      profile_path: '/broken.jpg',
      known_for_department: 'Acting',
    };

    client.setQueryData(getFavoritePersonsKey(), [existing]);
    mockGetFavoritePersons.mockResolvedValueOnce([existing]);
    mockAddFavoritePerson.mockRejectedValueOnce(new Error('add failed'));

    const { result } = renderHook(() => useAddFavoritePerson(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ personData: candidate })).rejects.toThrow('add failed');
    });

    await waitFor(() => {
      const cached = client.getQueryData<FavoritePerson[]>(getFavoritePersonsKey()) ?? [];
      expect(cached).toHaveLength(1);
      expect(cached[0].id).toBe(existing.id);
    });
  });

  it('rolls back optimistic removal when mutation fails', async () => {
    const client = createQueryClient();
    const existing = [createFavoritePerson(1, 'First'), createFavoritePerson(2, 'Second')];

    client.setQueryData(getFavoritePersonsKey(), existing);
    mockRemoveFavoritePerson.mockRejectedValueOnce(new Error('remove failed'));

    const { result } = renderHook(() => useRemoveFavoritePerson(), {
      wrapper: createWrapper(client),
    });

    await act(async () => {
      await expect(result.current.mutateAsync({ personId: 2 })).rejects.toThrow('remove failed');
    });

    await waitFor(() => {
      const cached = client.getQueryData<FavoritePerson[]>(getFavoritePersonsKey()) ?? [];
      expect(cached.map((person) => person.id)).toEqual([1, 2]);
    });
  });
});
