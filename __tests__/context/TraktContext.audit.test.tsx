import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { TRAKT_CONFIG, TRAKT_STORAGE_KEYS } from '@/src/config/trakt';

let capturedAuthCallback: ((user: any) => void) | null = null;
let mockCurrentUser: any = {
  uid: 'trakt-user-1',
  isAnonymous: false,
};
const mockUnsubscribe = jest.fn();

const mockCheckEnrichmentStatus = jest.fn();
const mockCheckSyncStatus = jest.fn();
const mockDisconnectTrakt = jest.fn();
const mockInitiateOAuthFlow = jest.fn();
const mockTriggerEnrichment = jest.fn();
const mockTriggerSync = jest.fn();

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, callback) => {
    capturedAuthCallback = callback;
    return mockUnsubscribe;
  }),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock('expo-web-browser', () => ({
  WebBrowserResultType: {
    DISMISS: 'dismiss',
  },
}));

jest.mock('@/src/services/TraktService', () => ({
  TraktRequestError: class TraktRequestError extends Error {},
  checkEnrichmentStatus: (...args: unknown[]) => mockCheckEnrichmentStatus(...args),
  checkSyncStatus: (...args: unknown[]) => mockCheckSyncStatus(...args),
  disconnectTrakt: (...args: unknown[]) => mockDisconnectTrakt(...args),
  initiateOAuthFlow: (...args: unknown[]) => mockInitiateOAuthFlow(...args),
  triggerEnrichment: (...args: unknown[]) => mockTriggerEnrichment(...args),
  triggerSync: (...args: unknown[]) => mockTriggerSync(...args),
}));

import { TraktProvider, useTrakt } from '@/src/context/TraktContext';

describe('TraktContext audited flows', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <TraktProvider>{children}</TraktProvider>
  );

  const mockTimers = () => {
    const originalClearInterval = globalThis.clearInterval;
    const originalSetInterval = globalThis.setInterval;
    const setIntervalMock = jest.fn(
      (_callback?: TimerHandler, _timeout?: number) =>
        123 as unknown as ReturnType<typeof setInterval>
    );
    const clearIntervalMock = jest.fn();

    (globalThis as typeof globalThis & { clearInterval: typeof clearInterval }).clearInterval =
      clearIntervalMock as unknown as typeof clearInterval;
    (globalThis as typeof globalThis & { setInterval: typeof setInterval }).setInterval =
      setIntervalMock as unknown as typeof setInterval;

    return {
      clearIntervalMock,
      restore: () => {
        (
          globalThis as typeof globalThis & {
            clearInterval: typeof clearInterval;
            setInterval: typeof setInterval;
          }
        ).clearInterval = originalClearInterval;
        (
          globalThis as typeof globalThis & {
            clearInterval: typeof clearInterval;
            setInterval: typeof setInterval;
          }
        ).setInterval = originalSetInterval;
      },
      setIntervalMock,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    capturedAuthCallback = null;
    mockCurrentUser = {
      uid: 'trakt-user-1',
      isAnonymous: false,
    };
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    mockCheckEnrichmentStatus.mockResolvedValue({
      lists: {},
      status: 'idle',
    });
    mockCheckSyncStatus.mockResolvedValue({
      connected: false,
      synced: false,
      status: 'idle',
    });
    mockDisconnectTrakt.mockResolvedValue(undefined);
    mockInitiateOAuthFlow.mockResolvedValue({ type: 'success' });
    mockTriggerEnrichment.mockResolvedValue(undefined);
    mockTriggerSync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Verifies a signed-in user with a recent sync does not trigger another automatic sync before the cooldown expires.
  it('skips signed-in auto-sync while the cooldown window is still active', async () => {
    const recentSyncIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      switch (key) {
        case TRAKT_STORAGE_KEYS.CONNECTED:
          return 'true';
        case TRAKT_STORAGE_KEYS.LAST_SYNCED:
          return recentSyncIso;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastSyncedAt?.toISOString()).toBe(recentSyncIso);
    expect(mockTriggerSync).not.toHaveBeenCalled();
    expect(mockCheckSyncStatus).not.toHaveBeenCalled();
  });

  // Verifies connecting a signed-in account starts sync polling and unmount cleanup clears the polling interval.
  it('starts polling on connect and clears the interval on unmount', async () => {
    mockCheckSyncStatus.mockResolvedValue({
      connected: true,
      synced: false,
      status: 'in_progress',
    });

    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const { clearIntervalMock, restore, setIntervalMock } = mockTimers();
    const originalSetTimeout = globalThis.setTimeout;
    const setTimeoutMock = jest.fn((callback: TimerHandler) => {
      if (typeof callback === 'function') {
        callback();
      }
      return 1 as unknown as ReturnType<typeof setTimeout>;
    });
    (
      globalThis as typeof globalThis & {
        setTimeout: typeof setTimeout;
      }
    ).setTimeout = setTimeoutMock as unknown as typeof setTimeout;

    try {
      await act(async () => {
        await result.current.connectTrakt();
        await Promise.resolve();
      });

      expect(setIntervalMock).toHaveBeenCalledWith(
        expect.any(Function),
        TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
      );

      unmount();

      expect(clearIntervalMock).toHaveBeenCalled();
    } finally {
      (
        globalThis as typeof globalThis & {
          setTimeout: typeof setTimeout;
        }
      ).setTimeout = originalSetTimeout;
      restore();
    }
  });

  // Verifies persisted Trakt connection, sync status, and enrichment timestamps are restored on mount.
  it('hydrates persisted sync state from storage on mount', async () => {
    const lastSyncedIso = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const lastEnrichedIso = '2026-04-29T10:30:00.000Z';
    const persistedStatus = {
      connected: true,
      synced: true,
      status: 'completed',
      lastSyncedAt: lastSyncedIso,
    };

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      switch (key) {
        case TRAKT_STORAGE_KEYS.CONNECTED:
          return 'true';
        case TRAKT_STORAGE_KEYS.LAST_SYNCED:
          return lastSyncedIso;
        case TRAKT_STORAGE_KEYS.SYNC_STATUS:
          return JSON.stringify(persistedStatus);
        case TRAKT_STORAGE_KEYS.LAST_ENRICHED:
          return lastEnrichedIso;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
      expect(result.current.syncStatus).toEqual(persistedStatus);
    });

    expect(result.current.isConnected).toBe(true);
    expect(result.current.lastSyncedAt?.toISOString()).toBe(lastSyncedIso);
    expect(result.current.lastEnrichedAt?.toISOString()).toBe(lastEnrichedIso);
    expect(mockCheckSyncStatus).not.toHaveBeenCalled();
  });

  // Verifies disconnect tears down active polling, clears persisted sync state, and prevents orphan polling after the user disconnects.
  it('clears intervals and resets Trakt state on disconnect', async () => {
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const { clearIntervalMock, restore, setIntervalMock } = mockTimers();

    try {
      mockCheckSyncStatus.mockResolvedValueOnce({
        connected: true,
        synced: false,
        status: 'in_progress',
      });

      await act(async () => {
        await result.current.syncNow();
        await Promise.resolve();
      });

      expect(result.current.isSyncing).toBe(true);
      expect(setIntervalMock).toHaveBeenCalled();

      await act(async () => {
        await result.current.disconnectTrakt();
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
        expect(result.current.isConnected).toBe(false);
        expect(result.current.isSyncing).toBe(false);
        expect(result.current.lastSyncedAt).toBeNull();
        expect(result.current.lastEnrichedAt).toBeNull();
        expect(result.current.syncStatus).toBeNull();
      });

      expect(clearIntervalMock).toHaveBeenCalled();
      expect(mockCheckSyncStatus).toHaveBeenCalledTimes(1);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(TRAKT_STORAGE_KEYS.LAST_ENRICHED);
    } finally {
      restore();
    }
  });

  // Verifies a completed sync triggers enrichment polling and records the enrichment completion timestamp once polling resolves.
  it('starts post-sync enrichment polling and resolves the completed enrichment timestamp', async () => {
    const enrichedIso = '2026-05-01T12:00:00.000Z';
    let capturedEnrichmentPoll: (() => Promise<void>) | null = null;
    mockCheckSyncStatus.mockResolvedValueOnce({
      connected: true,
      synced: true,
      status: 'completed',
      lastSyncedAt: '2026-05-01T11:00:00.000Z',
    });
    mockCheckEnrichmentStatus
      .mockResolvedValueOnce({
        lists: {},
        status: 'in_progress',
      })
      .mockResolvedValueOnce({
        completedAt: enrichedIso,
        lists: {},
        status: 'completed',
      });

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const { clearIntervalMock, restore, setIntervalMock } = mockTimers();
    setIntervalMock.mockImplementation((callback?: TimerHandler, _timeout?: number) => {
      if (typeof callback === 'function') {
        capturedEnrichmentPoll = callback as () => Promise<void>;
      }
      return 456 as unknown as ReturnType<typeof setInterval>;
    });

    try {
      await act(async () => {
        await result.current.syncNow();
        await Promise.resolve();
      });

      expect(result.current.isEnriching).toBe(true);
      expect(typeof capturedEnrichmentPoll).toBe('function');

      await act(async () => {
        await capturedEnrichmentPoll?.();
        await Promise.resolve();
      });

      expect(result.current.isEnriching).toBe(false);
      expect(result.current.lastEnrichedAt?.toISOString()).toBe(enrichedIso);

      expect(clearIntervalMock).toHaveBeenCalled();
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        TRAKT_STORAGE_KEYS.LAST_ENRICHED,
        enrichedIso
      );
    } finally {
      restore();
    }
  });
});
