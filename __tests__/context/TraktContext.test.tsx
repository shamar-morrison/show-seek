import { act, renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';

let capturedAuthCallback: ((user: any) => void) | null = null;
let mockCurrentUser: any = null;
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
  checkEnrichmentStatus: (...args: any[]) => mockCheckEnrichmentStatus(...args),
  checkSyncStatus: (...args: any[]) => mockCheckSyncStatus(...args),
  disconnectTrakt: (...args: any[]) => mockDisconnectTrakt(...args),
  initiateOAuthFlow: (...args: any[]) => mockInitiateOAuthFlow(...args),
  triggerEnrichment: (...args: any[]) => mockTriggerEnrichment(...args),
  triggerSync: (...args: any[]) => mockTriggerSync(...args),
}));

import { TraktProvider, useTrakt } from '@/src/context/TraktContext';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

describe('TraktContext', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    capturedAuthCallback = null;
    mockCurrentUser = null;
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
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
    });
    mockDisconnectTrakt.mockResolvedValue(undefined);
    mockInitiateOAuthFlow.mockResolvedValue({ type: 'dismiss' });
    mockTriggerEnrichment.mockResolvedValue(undefined);
    mockTriggerSync.mockResolvedValue(undefined);
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TraktProvider>{children}</TraktProvider>
    </QueryClientProvider>
  );

  it('rejects anonymous users from all user-triggered Trakt actions without calling TraktService', async () => {
    mockCurrentUser = { isAnonymous: true, uid: 'anon-1' };

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(result.current.connectTrakt()).rejects.toThrow('Must be logged in to connect Trakt');
    await expect(result.current.syncNow()).rejects.toThrow('Must be logged in to sync');
    await expect(result.current.disconnectTrakt()).rejects.toThrow('Must be logged in to disconnect');
    await expect(result.current.enrichData()).rejects.toThrow('Must be logged in to enrich data');

    expect(mockInitiateOAuthFlow).not.toHaveBeenCalled();
    expect(mockTriggerSync).not.toHaveBeenCalled();
    expect(mockDisconnectTrakt).not.toHaveBeenCalled();
    expect(mockTriggerEnrichment).not.toHaveBeenCalled();
  });

  it('returns undefined from checkSyncStatus for anonymous users without calling TraktService', async () => {
    mockCurrentUser = { isAnonymous: true, uid: 'anon-1' };

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(result.current.checkSyncStatus()).resolves.toBeUndefined();
    expect(mockCheckSyncStatus).not.toHaveBeenCalled();
  });

  it('does not auto-sync for anonymous users even when persisted Trakt state exists', async () => {
    const staleSyncIso = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
    mockCurrentUser = { isAnonymous: true, uid: 'anon-1' };

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      switch (key) {
        case TRAKT_STORAGE_KEYS.CONNECTED:
          return 'true';
        case TRAKT_STORAGE_KEYS.LAST_SYNCED:
          return staleSyncIso;
        default:
          return null;
      }
    });

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.isConnected).toBe(true);
    expect(mockTriggerSync).not.toHaveBeenCalled();
    expect(mockCheckSyncStatus).not.toHaveBeenCalled();
  });

  it('invalidates library queries and updates isEnriching when background enrichment transitions to completed', async () => {
    let capturedSnapshotCallback: ((snapshot: any) => void) | null = null;
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      capturedSnapshotCallback = callback;
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-enrich-1' };
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 1. Initial snapshot: status is in_progress
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktEnrichmentStatus: {
            status: 'in_progress',
          },
        }),
      });
    });

    expect(result.current.isEnriching).toBe(true);
    expect(invalidateSpy).not.toHaveBeenCalled();

    // 2. Snapshot transitions to completed
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktEnrichmentStatus: {
            completedAt: { toDate: () => new Date('2026-08-31T16:00:00Z') },
            status: 'completed',
          },
        }),
      });
    });

    expect(result.current.isEnriching).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['lists', 'user-enrich-1'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['ratings', 'user-enrich-1'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['watchedMovies', 'user-enrich-1'] })
    );
  });

  it('rejects startZipImport for anonymous users', async () => {
    mockCurrentUser = { isAnonymous: true, uid: 'anon-1' };

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await expect(
      result.current.startZipImport({
        name: 'export.zip',
        size: 1024,
        uri: 'file:///export.zip',
      })
    ).rejects.toThrow('Must be logged in to import Trakt archive');
  });

  it('handles zip import flow and subscribes to progress doc', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    const uploadSpy = jest.spyOn(traktZipImportService, 'uploadZipFile').mockResolvedValue('path/to/file.zip');
    let capturedProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedProgressCallback = args[2];
        return jest.fn();
      }
    );
    const startImportSpy = jest.spyOn(traktZipImportService, 'startImport').mockResolvedValue({ importId: 'zip_123' });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-1' };
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await result.current.startZipImport({
        name: 'test.zip',
        size: 2048,
        uri: 'file:///test.zip',
      });
    });

    expect(uploadSpy).toHaveBeenCalledWith(
      'user-zip-1',
      expect.any(String),
      'file:///test.zip',
      expect.any(Function)
    );
    expect(subscribeSpy).toHaveBeenCalledWith(
      'user-zip-1',
      expect.any(String),
      expect.any(Function),
      expect.any(Function)
    );
    expect(startImportSpy).toHaveBeenCalled();
    expect(result.current.zipImportUiState).toBe('processing');

    // Simulate progress callback with completed status
    await act(async () => {
      capturedProgressCallback?.({
        id: 'zip_123',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { movies: 10 },
        status: 'completed',
        userId: 'user-zip-1',
      });
    });

    expect(result.current.zipImportUiState).toBe('completed');
    expect(result.current.zipImportDoc?.stats?.movies).toBe(10);

    // Dismiss zip import
    act(() => {
      result.current.dismissZipImport();
    });

    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
  });

  it('restores in-flight zip import state from user document and invalidates queries on completion', async () => {
    let capturedSnapshotCallback: ((snapshot: any) => void) | null = null;
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      capturedSnapshotCallback = callback;
      return jest.fn();
    });
    // Terminal user-doc snapshots require a matching progress doc before the
    // summary shows, so capture the progress subscription to deliver it.
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedProgressCallback = args[2];
        return jest.fn();
      }
    );

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-restore' };
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 1. Initial snapshot: zip import is processing in background
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            activeImportId: 'import_active_999',
            status: 'processing',
          },
        }),
      });
    });

    expect(result.current.isZipImporting).toBe(true);
    expect(result.current.zipImportUiState).toBe('processing');

    // Trying to start an OAuth sync while zip import is active throws
    await expect(result.current.syncNow()).rejects.toThrow('A Trakt zip import is currently in progress.');

    // Trying to start another zip import while zip import is active throws
    await expect(
      result.current.startZipImport({
        name: 'another.zip',
        size: 500,
        uri: 'file:///another.zip',
      })
    ).rejects.toThrow('A Trakt zip import is already in progress.');

    // 2. Progress doc arrives with the terminal state and real stats.
    await act(async () => {
      capturedProgressCallback?.({
        id: 'import_active_999',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 0, episodes: 0, favorites: 0, movies: 5, movieWatches: 0, ratings: 0, shows: 0, watchlist: 0 },
        status: 'completed',
        userId: 'user-zip-restore',
      });
    });

    // 3. User-doc snapshot transitions to completed (now with doc present).
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            activeImportId: 'import_active_999',
            completedAt: { toDate: () => new Date() },
            status: 'completed',
          },
        }),
      });
    });

    expect(result.current.zipImportDoc?.stats?.movies).toBe(5);
    expect(result.current.isZipImporting).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['lists', 'user-zip-restore'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['ratings', 'user-zip-restore'] })
    );
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['watchedMovies', 'user-zip-restore'] })
    );

    subscribeSpy.mockRestore();
  });

  it('exposes nextAllowedZipImportAt date and isZipImportRateLimited from user document snapshot', async () => {
    let capturedSnapshotCallback: ((snapshot: any) => void) | null = null;
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      capturedSnapshotCallback = callback;
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-cooldown' };

    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // 1. Initial snapshot with future nextAllowedImportAt
    const futureDate = new Date(Date.now() + 3 * 60 * 60 * 1000);
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            errorCategory: 'in_flight',
            failedAt: { toDate: () => new Date() },
            nextAllowedImportAt: { toDate: () => futureDate },
            status: 'failed',
          },
        }),
      });
    });

    expect(result.current.nextAllowedZipImportAt).toEqual(futureDate);
    expect(result.current.isZipImportRateLimited).toBe(true);

    // 2. Snapshot transitions to expired cooldown (in the past)
    const pastDate = new Date(Date.now() - 60 * 1000);
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            nextAllowedImportAt: { toDate: () => pastDate },
            status: 'failed',
          },
        }),
      });
    });

    expect(result.current.nextAllowedZipImportAt).toEqual(pastDate);
    expect(result.current.isZipImportRateLimited).toBe(false);

    // 3. Snapshot with nextAllowedImportAt deleted (pre-flight failure or cleared)
    await act(async () => {
      capturedSnapshotCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            errorCategory: 'pre_flight',
            status: 'failed',
          },
        }),
      });
    });

    expect(result.current.nextAllowedZipImportAt).toBeNull();
    expect(result.current.isZipImportRateLimited).toBe(false);
  });

  it('automatically flips isZipImportRateLimited from true to false as time passes without requiring a new Firestore snapshot', async () => {
    jest.useFakeTimers();
    try {
      const { onSnapshot } = jest.requireMock('firebase/firestore');
      let capturedSnapshotCallback: ((snap: any) => void) | null = null;
      (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
        capturedSnapshotCallback = callback;
        return jest.fn();
      });

      mockCurrentUser = { isAnonymous: false, uid: 'user-zip-ticker' };
      const { result } = renderHook(() => useTrakt(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(mockCurrentUser);
      });

      // Snapshot with a cooldown 20 seconds in the future
      const now = Date.now();
      const futureDate = new Date(now + 20 * 1000);
      await act(async () => {
        capturedSnapshotCallback?.({
          exists: () => true,
          data: () => ({
            traktZipImportStatus: {
              completedAt: { toDate: () => new Date(now) },
              nextAllowedImportAt: { toDate: () => futureDate },
              status: 'completed',
            },
          }),
        });
      });

      expect(result.current.nextAllowedZipImportAt).toEqual(futureDate);
      expect(result.current.isZipImportRateLimited).toBe(true);

      // Advance by 15s (20s cooldown has 5s remaining)
      act(() => {
        jest.advanceTimersByTime(15000);
      });
      expect(result.current.isZipImportRateLimited).toBe(true);

      // Advance by another 15s (total 30s elapsed, past the 20s cooldown)
      act(() => {
        jest.advanceTimersByTime(15000);
      });
      // isZipImportRateLimited should now be false without any new snapshot!
      expect(result.current.isZipImportRateLimited).toBe(false);

      // Confirm interval has self-stopped and is no longer ticking
      const timerCount = jest.getTimerCount();
      act(() => {
        jest.advanceTimersByTime(60000);
      });
      expect(jest.getTimerCount()).toBeLessThanOrEqual(timerCount);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not start an interval when nextAllowedZipImportAt is already expired or null', async () => {
    jest.useFakeTimers();
    const setIntervalSpy = jest.spyOn(global, 'setInterval');
    try {
      const { onSnapshot } = jest.requireMock('firebase/firestore');
      let capturedSnapshotCallback: ((snap: any) => void) | null = null;
      (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
        capturedSnapshotCallback = callback;
        return jest.fn();
      });

      mockCurrentUser = { isAnonymous: false, uid: 'user-zip-expired-snap' };
      const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

      await act(async () => {
        capturedAuthCallback?.(mockCurrentUser);
      });

      setIntervalSpy.mockClear();

      // Snapshot with an already-expired timestamp (10 minutes ago)
      const pastDate = new Date(Date.now() - 10 * 60 * 1000);
      await act(async () => {
        capturedSnapshotCallback?.({
          exists: () => true,
          data: () => ({
            traktZipImportStatus: {
              nextAllowedImportAt: { toDate: () => pastDate },
              status: 'idle',
            },
          }),
        });
      });

      expect(result.current.isZipImportRateLimited).toBe(false);
      // No extra interval timer should have been started
      expect(setIntervalSpy).not.toHaveBeenCalled();

      // Snapshot with null nextAllowedImportAt
      await act(async () => {
        capturedSnapshotCallback?.({
          exists: () => true,
          data: () => ({
            traktZipImportStatus: {
              status: 'idle',
            },
          }),
        });
      });

      expect(result.current.nextAllowedZipImportAt).toBeNull();
      expect(result.current.isZipImportRateLimited).toBe(false);
      expect(setIntervalSpy).not.toHaveBeenCalled();

      // Snapshot with invalid nextAllowedImportAt Date returned from toDate()
      await act(async () => {
        capturedSnapshotCallback?.({
          exists: () => true,
          data: () => ({
            traktZipImportStatus: {
              nextAllowedImportAt: { toDate: () => new Date('invalid') },
              status: 'idle',
            },
          }),
        });
      });

      expect(result.current.nextAllowedZipImportAt).toBeNull();
      expect(result.current.isZipImportRateLimited).toBe(false);
      expect(setIntervalSpy).not.toHaveBeenCalled();

      unmount();
    } finally {
      setIntervalSpy.mockRestore();
      jest.useRealTimers();
    }
  });

  it('sets rate-limited zipImportError when startZipImport rejects with TraktZipRateLimitedError', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { traktZipImportService, TraktZipRateLimitedError } = require('@/src/services/TraktZipImportService');
    jest.spyOn(traktZipImportService, 'uploadZipFile').mockResolvedValue('path/to/file.zip');

    const futureDate = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const startImportSpy = jest.spyOn(traktZipImportService, 'startImport').mockRejectedValue(
      new TraktZipRateLimitedError(
        'Please wait before starting another Trakt zip import.',
        futureDate.toISOString()
      )
    );

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-rate-err' };
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      await expect(
        result.current.startZipImport({
          name: 'export.zip',
          size: 1024,
          uri: 'file:///export.zip',
        })
      ).rejects.toThrow(TraktZipRateLimitedError);
    });

    expect(startImportSpy).toHaveBeenCalled();
    expect(result.current.zipImportUiState).toBe('failed');
    expect(result.current.zipImportError).toContain('Import cooldown active.');
    expect(result.current.zipImportError).toContain('You can start another import');

    // Also test fallback message when TraktZipRateLimitedError has no retry ISO
    startImportSpy.mockRejectedValueOnce(
      new TraktZipRateLimitedError('Please wait before starting another Trakt zip import.')
    );

    await act(async () => {
      await expect(
        result.current.startZipImport({
          name: 'export.zip',
          size: 1024,
          uri: 'file:///export.zip',
        })
      ).rejects.toThrow(TraktZipRateLimitedError);
    });

    expect(result.current.zipImportUiState).toBe('failed');
    expect(result.current.zipImportError).toBe(
      'Please wait before starting another import.'
    );

    // Regression test: non-empty but invalid nextAllowedImportAt falls back to generic message and clears nextAllowedZipImportAt
    startImportSpy.mockRejectedValueOnce(
      new TraktZipRateLimitedError(
        'Please wait before starting another Trakt zip import.',
        'invalid-date-string'
      )
    );

    await act(async () => {
      await expect(
        result.current.startZipImport({
          name: 'export.zip',
          size: 1024,
          uri: 'file:///export.zip',
        })
      ).rejects.toThrow(TraktZipRateLimitedError);
    });

    expect(result.current.zipImportUiState).toBe('failed');
    expect(result.current.nextAllowedZipImportAt).toBeNull();
    expect(result.current.zipImportError).toBe(
      'Please wait before starting another import.'
    );

    consoleErrorSpy.mockRestore();
  });

  it('does not resurrect the completed summary after dismiss when the same terminal snapshot refires', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );
    let capturedServiceProgressCallback: any = null;

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-dismiss' };
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    const userDocCallback = userDocSnapshots[0];

    // Background import finishes while the app is open.
    await act(async () => {
      userDocCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_done_1', status: 'processing' },
        }),
      });
    });
    expect(result.current.zipImportUiState).toBe('processing');

    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_done_1',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 1, episodes: 2, favorites: 3, movies: 4, movieWatches: 5, ratings: 6, shows: 7, watchlist: 8 },
        status: 'completed',
        userId: 'user-zip-dismiss',
      });
    });
    expect(result.current.zipImportUiState).toBe('completed');
    expect(result.current.zipImportDoc?.stats?.movies).toBe(4);

    // User taps Done.
    act(() => {
      result.current.dismissZipImport();
    });
    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID,
      'zip_done_1'
    );

    // The server-side terminal status persists, so a later user-doc
    // snapshot refire must not resurrect the (now stat-less) summary.
    await act(async () => {
      userDocCallback?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: {
            id: 'zip_done_1',
            nextAllowedImportAt: { toDate: () => new Date(Date.now() + 3600000) },
            phase: 'completed',
            status: 'completed',
          },
        }),
      });
    });

    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
    // Cooldown info from the same snapshot is still honored.
    expect(result.current.isZipImportRateLimited).toBe(true);

    subscribeSpy.mockRestore();
  });

  it('hydrates stats via subscription when a completed snapshot arrives without a local doc', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedServiceProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-hydrate' };
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Fresh launch: server already says completed, but there is no local doc.
    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_fresh_1', phase: 'completed', status: 'completed' },
        }),
      });
    });

    // Must not jump straight to completed with zeroed stats; hydrate first.
    expect(subscribeSpy).toHaveBeenCalledWith(
      'user-zip-hydrate',
      'zip_fresh_1',
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.current.zipImportUiState).toBe('processing');
    expect(result.current.zipImportDoc).toBeNull();

    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_fresh_1',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 0, episodes: 0, favorites: 0, movies: 9, movieWatches: 0, ratings: 0, shows: 0, watchlist: 0 },
        status: 'completed',
        userId: 'user-zip-hydrate',
      });
    });

    expect(result.current.zipImportUiState).toBe('completed');
    expect(result.current.zipImportDoc?.stats?.movies).toBe(9);

    subscribeSpy.mockRestore();
  });

  it('restores the dismissed import id from storage and ignores its terminal snapshot', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) =>
      key === TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID ? 'zip_old_1' : null
    );

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-persist' };
    const { result } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_old_1', phase: 'completed', status: 'completed' },
        }),
      });
    });

    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
  });

  it('holds at processing when a completed snapshot arrives before the progress doc', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedServiceProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-hold' };
    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Terminal user-doc snapshot wins the race: no progress doc yet.
    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_hold_1', phase: 'completed', status: 'completed' },
        }),
      });
    });

    // Must not show completed with zeroed stats; hold at processing instead.
    expect(subscribeSpy).toHaveBeenCalledWith(
      'user-zip-hold',
      'zip_hold_1',
      expect.any(Function),
      expect.any(Function)
    );
    expect(result.current.zipImportUiState).toBe('processing');
    expect(result.current.zipImportDoc).toBeNull();

    // Progress doc arrives with real stats: now the summary may show.
    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_hold_1',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 1, episodes: 2, favorites: 3, movies: 11, movieWatches: 5, ratings: 6, shows: 7, watchlist: 8 },
        status: 'completed',
        userId: 'user-zip-hold',
      });
    });

    expect(result.current.zipImportUiState).toBe('completed');
    expect(result.current.zipImportDoc?.stats?.movies).toBe(11);

    subscribeSpy.mockRestore();
    unmount();
  });

  it('holds at processing when a failed snapshot arrives before the progress doc', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedServiceProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-hold-fail' };
    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_hold_2', error: 'Boom.', phase: 'failed', status: 'failed' },
        }),
      });
    });

    expect(result.current.zipImportUiState).toBe('processing');
    expect(result.current.zipImportDoc).toBeNull();

    await act(async () => {
      capturedServiceProgressCallback?.({
        error: 'Boom.',
        id: 'zip_hold_2',
        progress: { current: 50, phase: 'failed', total: 100 },
        status: 'failed',
        userId: 'user-zip-hold-fail',
      });
    });

    expect(result.current.zipImportUiState).toBe('failed');
    expect(result.current.zipImportError).toBe('Boom.');

    subscribeSpy.mockRestore();
    unmount();
  });

  it('falls back to the failed view when the held-for progress doc never arrives', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      () => jest.fn()
    );

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-hold-timeout' };
    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    jest.useFakeTimers();
    try {
      // Terminal snapshot with no progress doc: hold begins, 60s timer armed.
      await act(async () => {
        userDocSnapshots[0]?.({
          exists: () => true,
          data: () => ({
            traktZipImportStatus: { id: 'zip_ghost_1', phase: 'failed', status: 'failed' },
          }),
        });
      });

      expect(result.current.zipImportUiState).toBe('processing');

      // Just before the timeout: still holding.
      await act(async () => {
        jest.advanceTimersByTime(59999);
      });
      expect(result.current.zipImportUiState).toBe('processing');

      // Timeout fires: failed view with a localized retry message.
      await act(async () => {
        jest.advanceTimersByTime(1);
      });
      expect(result.current.zipImportUiState).toBe('failed');
      expect(result.current.zipImportError).toContain('unavailable');

      // Retry path stays available: dismissing returns to idle.
      act(() => {
        result.current.dismissZipImport();
      });
      expect(result.current.zipImportUiState).toBe('idle');
    } finally {
      jest.useRealTimers();
    }

    subscribeSpy.mockRestore();
    unmount();
  });

  it('catches AsyncStorage dismissal-write failures without breaking session state', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedServiceProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );
    const uploadSpy = jest.spyOn(traktZipImportService, 'uploadZipFile').mockResolvedValue('path/to/file.zip');
    const startImportSpy = jest.spyOn(traktZipImportService, 'startImport').mockResolvedValue({ importId: 'zip_storage_1' });

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-storage' };
    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Reach completed via the progress doc.
    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_storage_1', status: 'processing' },
        }),
      });
    });
    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_storage_1',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 0, episodes: 0, favorites: 0, movies: 3, movieWatches: 0, ratings: 0, shows: 0, watchlist: 0 },
        status: 'completed',
        userId: 'user-zip-storage',
      });
    });
    expect(result.current.zipImportUiState).toBe('completed');

    // setItem fails: dismiss must not throw, session state still resets.
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await act(async () => {
      result.current.dismissZipImport();
    });
    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      '[Trakt] Failed to persist dismissed zip import id:',
      expect.anything()
    );

    // removeItem fails: starting a new import still proceeds normally.
    (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('disk full'));
    await act(async () => {
      await result.current.startZipImport({
        name: 'next.zip',
        size: 512,
        uri: 'file:///next.zip',
      });
    });
    expect(uploadSpy).toHaveBeenCalled();
    expect(startImportSpy).toHaveBeenCalled();
    expect(result.current.zipImportUiState).toBe('processing');
    expect(warnSpy).toHaveBeenCalledWith(
      '[Trakt] Failed to persist dismissed zip import id:',
      expect.anything()
    );

    warnSpy.mockRestore();
    subscribeSpy.mockRestore();
    unmount();
  });

  it('defers pre-hydration terminal snapshots and honors dismissal in the progress callback', async () => {
    const { traktZipImportService } = require('@/src/services/TraktZipImportService');
    let capturedServiceProgressCallback: any = null;
    const subscribeSpy = jest.spyOn(traktZipImportService, 'subscribeToProgress').mockImplementation(
      (...args: Parameters<typeof traktZipImportService.subscribeToProgress>) => {
        capturedServiceProgressCallback = args[2];
        return jest.fn();
      }
    );

    // Hold dismissal hydration open until the test releases it.
    let releaseDismissedId!: (value: string | null) => void;
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID) {
        return new Promise<string | null>((resolve) => {
          releaseDismissedId = resolve;
        });
      }
      return null;
    });

    const userDocSnapshots: ((snapshot: any) => void)[] = [];
    const { onSnapshot } = jest.requireMock('firebase/firestore');
    (onSnapshot as jest.Mock).mockImplementation((_ref: any, callback: any) => {
      userDocSnapshots.push(callback);
      return jest.fn();
    });

    mockCurrentUser = { isAnonymous: false, uid: 'user-zip-defer' };
    const { result, unmount } = renderHook(() => useTrakt(), { wrapper });

    await act(async () => {
      capturedAuthCallback?.(mockCurrentUser);
    });

    // Terminal snapshot arrives while hydration is still pending: stashed,
    // summary not shown.
    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_deferred_1', phase: 'completed', status: 'completed' },
        }),
      });
    });
    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
    expect(subscribeSpy).not.toHaveBeenCalled();

    // Hydration finishes: the stashed snapshot belongs to the dismissed
    // import, so it stays suppressed.
    await act(async () => {
      releaseDismissedId('zip_deferred_1');
    });
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();
    expect(subscribeSpy).not.toHaveBeenCalled();

    // Progress callback also respects dismissal directly: a late/redelivered
    // doc for the dismissed import cannot resurrect the summary.
    await act(async () => {
      userDocSnapshots[0]?.({
        exists: () => true,
        data: () => ({
          traktZipImportStatus: { id: 'zip_direct_2', status: 'processing' },
        }),
      });
    });
    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_direct_2',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 0, episodes: 0, favorites: 0, movies: 7, movieWatches: 0, ratings: 0, shows: 0, watchlist: 0 },
        status: 'completed',
        userId: 'user-zip-defer',
      });
    });
    expect(result.current.zipImportUiState).toBe('completed');

    act(() => {
      result.current.dismissZipImport();
    });
    expect(result.current.zipImportUiState).toBe('idle');

    await act(async () => {
      capturedServiceProgressCallback?.({
        id: 'zip_direct_2',
        progress: { current: 100, phase: 'completed', total: 100 },
        stats: { customLists: 0, episodes: 0, favorites: 0, movies: 7, movieWatches: 0, ratings: 0, shows: 0, watchlist: 0 },
        status: 'completed',
        userId: 'user-zip-defer',
      });
    });
    expect(result.current.zipImportUiState).toBe('idle');
    expect(result.current.zipImportDoc).toBeNull();

    subscribeSpy.mockRestore();
    unmount();
  });
});
