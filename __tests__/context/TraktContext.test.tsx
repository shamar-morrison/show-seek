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

describe('TraktContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedAuthCallback = null;
    mockCurrentUser = null;
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
    <TraktProvider>{children}</TraktProvider>
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
});
