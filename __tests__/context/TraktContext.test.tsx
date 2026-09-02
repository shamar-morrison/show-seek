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
      (_userId: string, _importId: string, onProgress: any) => {
        capturedProgressCallback = onProgress;
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

    // 2. Snapshot transitions to completed
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
  });
});
