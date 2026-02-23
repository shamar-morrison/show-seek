import {
  useClearPosterOverride,
  usePosterOverrides,
  useSetPosterOverride,
} from '@/src/hooks/usePosterOverrides';
import { DEFAULT_PREFERENCES } from '@/src/types/preferences';
import { notifyManager, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import React from 'react';

const mockSetPosterOverride = jest.fn();
const mockClearPosterOverride = jest.fn();
const mockAuthState = {
  user: { uid: 'user-1' } as { uid: string } | null,
};
let mockPreferences = {
  ...DEFAULT_PREFERENCES,
  posterOverrides: {} as Record<string, string>,
};

jest.mock('@/src/context/auth', () => ({
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences }),
}));

jest.mock('@/src/services/PosterOverrideService', () => ({
  posterOverrideService: {
    setPosterOverride: (...args: unknown[]) => mockSetPosterOverride(...args),
    clearPosterOverride: (...args: unknown[]) => mockClearPosterOverride(...args),
  },
}));

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

describe('usePosterOverrides', () => {
  beforeAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => act(fn));
  });

  afterAll(() => {
    notifyManager.setNotifyFunction((fn: () => void) => fn());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockAuthState.user = { uid: 'user-1' };
    mockPreferences = {
      ...DEFAULT_PREFERENCES,
      posterOverrides: {},
    };
  });

  it('resolves poster path using user overrides', () => {
    mockPreferences = {
      ...DEFAULT_PREFERENCES,
      posterOverrides: {
        movie_101: '/override.jpg',
      },
    };

    const { result } = renderHook(() => usePosterOverrides());

    expect(result.current.resolvePosterPath('movie', 101, '/fallback.jpg')).toBe('/override.jpg');
    expect(result.current.resolvePosterPath('tv', 202, '/fallback-tv.jpg')).toBe('/fallback-tv.jpg');
  });

  it('optimistically updates preferences cache when setting override', async () => {
    jest.useFakeTimers();
    mockSetPosterOverride.mockResolvedValue(undefined);

    const client = createQueryClient();
    client.setQueryData(['preferences', 'user-1'], {
      ...DEFAULT_PREFERENCES,
      posterOverrides: {},
    });

    const { result } = renderHook(() => useSetPosterOverride(), {
      wrapper: createWrapper(client),
    });

    try {
      await act(async () => {
        await result.current.mutateAsync({ mediaType: 'movie', mediaId: 77, posterPath: '/new.jpg' });
      });
      act(() => {
        jest.runOnlyPendingTimers();
      });

      const optimistic = client.getQueryData<any>(['preferences', 'user-1']);
      expect(optimistic.posterOverrides.movie_77).toBe('/new.jpg');
      expect(mockSetPosterOverride).toHaveBeenCalledWith('movie', 77, '/new.jpg');
    } finally {
      jest.useRealTimers();
    }
  });

  it('optimistically removes override from preferences cache when clearing override', async () => {
    jest.useFakeTimers();
    mockClearPosterOverride.mockResolvedValue(undefined);

    const client = createQueryClient();
    client.setQueryData(['preferences', 'user-1'], {
      ...DEFAULT_PREFERENCES,
      posterOverrides: {
        movie_77: '/old.jpg',
        tv_88: '/stay.jpg',
      },
    });

    const { result } = renderHook(() => useClearPosterOverride(), {
      wrapper: createWrapper(client),
    });

    try {
      await act(async () => {
        await result.current.mutateAsync({ mediaType: 'movie', mediaId: 77 });
      });
      act(() => {
        jest.runOnlyPendingTimers();
      });

      const optimistic = client.getQueryData<any>(['preferences', 'user-1']);
      expect(optimistic.posterOverrides.movie_77).toBeUndefined();
      expect(optimistic.posterOverrides.tv_88).toBe('/stay.jpg');
      expect(mockClearPosterOverride).toHaveBeenCalledWith('movie', 77);
    } finally {
      jest.useRealTimers();
    }
  });
});
