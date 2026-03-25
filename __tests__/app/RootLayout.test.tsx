import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';

let mockSegments: string[] = ['(tabs)', 'home'];
const mockReplace = jest.fn();
const mockTrackScreen = jest.fn();
const mockInitializeAnalytics = jest.fn(() => Promise.resolve());
const mockQueryClientClear = jest.fn();
const mockClearPersistedQueryCache = jest.fn(() => Promise.resolve());
const mockHydratePersistedQueryCache = jest.fn(
  (_queryClient?: unknown, _expectedOwnerId?: string | null) => Promise.resolve(true)
);
const mockPausePersistedQuerySync = jest.fn(() => Promise.resolve());
const mockResumePersistedQuerySync = jest.fn();
const mockDisposePersistedQuerySync = jest.fn(() => Promise.resolve());
const mockCreatePersistedQueryCacheSyncController = jest.fn(
  (
    _queryClient?: unknown,
    _options?: {
      getOwnerId: () => string | null;
    }
  ) => ({
    pause: mockPausePersistedQuerySync,
    resume: mockResumePersistedQuerySync,
    dispose: mockDisposePersistedQuerySync,
  })
);

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const mockAuthState = {
  user: null as null | { uid?: string; isAnonymous?: boolean },
  loading: false,
  hasCompletedOnboarding: true as boolean | null,
};

const mockPreferencesState = {
  preferences: { defaultLaunchScreen: '/(tabs)/home' },
  isLoading: false,
};

jest.mock('react-native-screens', () => ({
  enableScreens: jest.fn(),
}));

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@tanstack/react-query', () => ({
  QueryClient: jest.fn(() => ({
    clear: mockQueryClientClear,
    getQueryCache: () => ({
      subscribe: jest.fn(() => jest.fn()),
    }),
  })),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  Stack.Screen = () => null;

  return {
    useRouter: () => ({
      replace: mockReplace,
      push: jest.fn(),
      back: jest.fn(),
    }),
    useSegments: () => mockSegments,
    Stack,
  };
});

jest.mock('@/src/context/auth', () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
  useAuth: () => mockAuthState,
}));

jest.mock('@/src/hooks/usePreferences', () => ({
  usePreferences: () => mockPreferencesState,
}));

jest.mock('@/src/context/LanguageProvider', () => ({
  LanguageProvider: ({ children }: { children: React.ReactNode }) => children,
  useLanguage: () => ({ isLanguageReady: true }),
}));

jest.mock('@/src/context/RegionProvider', () => ({
  RegionProvider: ({ children }: { children: React.ReactNode }) => children,
  useRegion: () => ({ isRegionReady: true }),
}));

jest.mock('@/src/context/AccentColorProvider', () => ({
  AccentColorProvider: ({ children }: { children: React.ReactNode }) => children,
  useAccentColor: () => ({ accentColor: '#ff0000', isAccentReady: true }),
}));

jest.mock('@/src/context/PremiumContext', () => ({
  PremiumProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/context/TraktContext', () => ({
  TraktProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/hooks/useDeepLinking', () => ({
  useDeepLinking: jest.fn(),
}));

jest.mock('@/src/hooks/useQuickActions', () => ({
  useQuickActions: jest.fn(),
}));

jest.mock('@/src/utils/reminderSync', () => ({
  initializeReminderSync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/src/services/analytics', () => ({
  getAnalyticsScreenName: (segments: string[]) =>
    segments.filter((segment) => !segment.startsWith('(') && segment !== 'index').join('/') || null,
  initializeAnalytics: () => mockInitializeAnalytics(),
  trackScreen: (...args: unknown[]) => mockTrackScreen(...args),
}));

jest.mock('@/src/services/revenueCat', () => ({
  configureRevenueCat: jest.fn(() => Promise.resolve(false)),
}));

jest.mock('@/src/services/queryCachePersistence', () => ({
  clearPersistedQueryCache: () => mockClearPersistedQueryCache(),
  createPersistedQueryCacheSyncController: (
    queryClient: unknown,
    options: { getOwnerId: () => string | null }
  ) => mockCreatePersistedQueryCacheSyncController(queryClient, options),
  hydratePersistedQueryCache: (queryClient: unknown, expectedOwnerId: string | null) =>
    mockHydratePersistedQueryCache(queryClient, expectedOwnerId),
}));

jest.mock('@/src/i18n', () => ({
  t: jest.fn(() => 'Notifications'),
}));

import RootLayout from '@/app/_layout';

beforeAll(() => {
  global.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
});

afterAll(() => {
  // @ts-expect-error - cleanup test shim
  delete global.requestAnimationFrame;
});

describe('RootLayout routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSegments = ['(tabs)', 'home'];
    mockAuthState.user = null;
    mockAuthState.loading = false;
    mockAuthState.hasCompletedOnboarding = true;
    mockPreferencesState.preferences = { defaultLaunchScreen: '/(tabs)/home' };
    mockPreferencesState.isLoading = false;
    mockClearPersistedQueryCache.mockResolvedValue(undefined);
    mockHydratePersistedQueryCache.mockResolvedValue(true);
    mockPausePersistedQuerySync.mockResolvedValue(undefined);
    mockDisposePersistedQuerySync.mockResolvedValue(undefined);
    mockCreatePersistedQueryCacheSyncController.mockReturnValue({
      pause: mockPausePersistedQuerySync,
      resume: mockResumePersistedQuerySync,
      dispose: mockDisposePersistedQuerySync,
    });
  });

  it('redirects to onboarding when onboarding is incomplete', async () => {
    mockAuthState.hasCompletedOnboarding = false;
    mockSegments = ['(tabs)', 'home'];

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/onboarding');
    });
    expect(mockTrackScreen).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when onboarded but not authenticated', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = null;
    mockSegments = ['(tabs)', 'home'];

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
    expect(mockTrackScreen).not.toHaveBeenCalled();
  });

  it('redirects authenticated users in auth flow to preferred launch screen', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(auth)', 'sign-in'];
    mockPreferencesState.preferences = { defaultLaunchScreen: '/(tabs)/stats' };

    render(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(tabs)/stats');
    });
    expect(mockTrackScreen).not.toHaveBeenCalled();
  });

  it('redirects to sign-in when auth transitions from authenticated to unauthenticated on tabs', async () => {
    mockAuthState.hasCompletedOnboarding = true;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });
    expect(mockReplace).not.toHaveBeenCalled();

    mockAuthState.user = null;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('waits for auth loading to settle before hydrating persisted query cache', async () => {
    mockAuthState.loading = true;
    mockAuthState.user = { uid: 'user-1', isAnonymous: false };

    const { rerender } = render(<RootLayout />);

    expect(mockHydratePersistedQueryCache).not.toHaveBeenCalled();
    expect(mockResumePersistedQuerySync).not.toHaveBeenCalled();

    mockAuthState.loading = false;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockHydratePersistedQueryCache).toHaveBeenCalledWith(expect.anything(), 'user-1');
    });
    await waitFor(() => {
      expect(mockResumePersistedQuerySync).toHaveBeenCalledTimes(1);
    });
  });

  it('tracks a settled screen only once across rerenders', async () => {
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'discover'];

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'discover']);
    });

    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledTimes(1);
    });
  });

  it('logs persisted cache clear failures without interrupting auth transition cleanup', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];
    mockClearPersistedQueryCache.mockRejectedValueOnce(new Error('persist clear failed'));

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });

    mockAuthState.user = null;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });

    expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith(
        '[RootLayout] Failed to clear persisted query cache during auth transition:',
        expect.objectContaining({
          error: expect.any(Error),
          previousUid: 'user-1',
          currentUid: null,
        })
      );
    });

    consoleSpy.mockRestore();
  });

  it('pauses sync before clearing persisted cache during auth transitions', async () => {
    let resolvePause: (() => void) | null = null;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];
    mockPausePersistedQuerySync.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolvePause = resolve;
        })
    );

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });

    mockResumePersistedQuerySync.mockClear();
    mockAuthState.user = { uid: 'user-2' };
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockPausePersistedQuerySync).toHaveBeenCalledTimes(1);
    });
    expect(mockQueryClientClear).not.toHaveBeenCalled();
    expect(mockClearPersistedQueryCache).not.toHaveBeenCalled();

    await act(async () => {
      resolvePause?.();
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    });
  });

  it('resumes sync only after persisted cache clear completes', async () => {
    let resolveClear: (() => void) | null = null;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];
    mockClearPersistedQueryCache.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        })
    );

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });

    mockResumePersistedQuerySync.mockClear();
    mockAuthState.user = null;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    });
    expect(mockResumePersistedQuerySync).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear?.();
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(mockResumePersistedQuerySync).toHaveBeenCalledTimes(1);
    });
  });

  it('keeps auth transition redirects blocked until cleanup resumes sync', async () => {
    let resolveClear: (() => void) | null = null;
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];
    mockClearPersistedQueryCache.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveClear = resolve;
        })
    );

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });

    mockReplace.mockClear();
    mockResumePersistedQuerySync.mockClear();
    mockAuthState.user = null;
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    });

    expect(mockReplace).not.toHaveBeenCalled();

    await act(async () => {
      resolveClear?.();
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(mockResumePersistedQuerySync).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/sign-in');
    });
  });

  it('does not resume sync early when auth cleanup transitions overlap', async () => {
    const clearResolvers: Array<() => void> = [];
    mockAuthState.user = { uid: 'user-1' };
    mockSegments = ['(tabs)', 'home'];
    mockClearPersistedQueryCache.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          clearResolvers.push(resolve);
        })
    );

    const { rerender } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockTrackScreen).toHaveBeenCalledWith(['(tabs)', 'home']);
    });

    mockResumePersistedQuerySync.mockClear();
    mockAuthState.user = { uid: 'user-2' };
    rerender(<RootLayout />);

    await waitFor(() => {
      expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(1);
    });

    mockAuthState.user = { uid: 'user-3' };
    rerender(<RootLayout />);

    expect(mockResumePersistedQuerySync).not.toHaveBeenCalled();

    await act(async () => {
      clearResolvers[0]?.();
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(mockPausePersistedQuerySync).toHaveBeenCalledTimes(2);
    });
    await waitFor(() => {
      expect(mockClearPersistedQueryCache).toHaveBeenCalledTimes(2);
    });
    expect(mockResumePersistedQuerySync).not.toHaveBeenCalled();

    await act(async () => {
      clearResolvers[1]?.();
      await flushMicrotasks();
    });

    await waitFor(() => {
      expect(mockResumePersistedQuerySync).toHaveBeenCalledTimes(1);
    });
  });

  it('does not resume persisted cache sync after bootstrap unmounts early', async () => {
    let resolveHydration: ((value: boolean) => void) | null = null;
    mockHydratePersistedQueryCache.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveHydration = resolve;
        })
    );

    const { unmount } = render(<RootLayout />);

    await waitFor(() => {
      expect(mockHydratePersistedQueryCache).toHaveBeenCalledTimes(1);
    });

    unmount();

    await act(async () => {
      resolveHydration?.(true);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockResumePersistedQuerySync).not.toHaveBeenCalled();
  });
});
