import { DEFAULT_HOME_LISTS } from '@/src/constants/homeScreenLists';
import { usePreferences } from '@/src/hooks/usePreferences';
import { DEFAULT_PREFERENCES, HomeScreenListItem, UserPreferences } from '@/src/types/preferences';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';

const mockFetchPreferences = jest.fn();
const mockAuthState: { user: { uid: string } | null; loading: boolean } = {
  user: { uid: 'test-user-id' },
  loading: false,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    currentUser: { uid: 'test-user-id' },
  },
}));

jest.mock('@/src/services/PreferencesService', () => ({
  preferencesService: {
    fetchPreferences: (...args: any[]) => mockFetchPreferences(...args),
    updatePreference: jest.fn(),
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

const createWrapper = (client: QueryClient) =>
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };

describe('usePreferences', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'test-user-id' };
    mockAuthState.loading = false;
  });

  it('loads defaults first, then hydrates remote preferences including custom homeScreenLists', async () => {
    const deferred = createDeferred<UserPreferences>();
    mockFetchPreferences.mockReturnValueOnce(deferred.promise);

    const client = createQueryClient();
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(client),
    });

    const customLists: HomeScreenListItem[] = [
      { id: 'my-custom-list', type: 'custom', label: 'My Custom List' },
      { id: 'watchlist', type: 'default', label: 'Watchlist' },
    ];

    expect(mockFetchPreferences).toHaveBeenCalledWith('test-user-id');
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.current.homeScreenLists).toEqual(DEFAULT_HOME_LISTS);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasLoaded).toBe(false);

    act(() => {
      deferred.resolve({
        ...DEFAULT_PREFERENCES,
        homeScreenLists: customLists,
      });
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasLoaded).toBe(true);
    });

    expect(result.current.homeScreenLists).toEqual(customLists);
  });

  it('reports isLoading true only during initial hydration', async () => {
    const firstFetch = createDeferred<UserPreferences>();
    const secondFetch = createDeferred<UserPreferences>();
    mockFetchPreferences.mockReturnValueOnce(firstFetch.promise).mockReturnValueOnce(secondFetch.promise);

    const client = createQueryClient();
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasLoaded).toBe(false);

    act(() => {
      firstFetch.resolve(DEFAULT_PREFERENCES);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasLoaded).toBe(true);
    });

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(mockFetchPreferences).toHaveBeenCalledTimes(2);
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasLoaded).toBe(true);

    act(() => {
      secondFetch.resolve(DEFAULT_PREFERENCES);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  it('does not fetch when signed out', () => {
    mockAuthState.user = null;

    const client = createQueryClient();
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(client),
    });

    expect(mockFetchPreferences).not.toHaveBeenCalled();
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.current.homeScreenLists).toEqual(DEFAULT_HOME_LISTS);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.hasLoaded).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('falls back gracefully on fetch error and exits loading state', async () => {
    const deferred = createDeferred<UserPreferences>();
    mockFetchPreferences.mockReturnValueOnce(deferred.promise);

    const client = createQueryClient();
    const { result } = renderHook(() => usePreferences(), {
      wrapper: createWrapper(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.hasLoaded).toBe(false);
    expect(result.current.homeScreenLists).toEqual(DEFAULT_HOME_LISTS);

    act(() => {
      deferred.reject(new Error('network unavailable'));
    });

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.hasLoaded).toBe(true);
    });

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    expect(result.current.homeScreenLists).toEqual(DEFAULT_HOME_LISTS);
  });
});
