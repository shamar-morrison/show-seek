import { act, render, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TraktProvider, useTrakt } from '@/src/context/TraktContext';
import * as TraktService from '@/src/services/TraktService';
import { traktZipImportService } from '@/src/services/TraktZipImportService';

let capturedAuthCallback: ((user: any) => void) | null = null;
let mockCurrentUser: any = null;

jest.mock('firebase/auth', () => ({
  onAuthStateChanged: jest.fn((_auth, callback) => {
    capturedAuthCallback = callback;
    return jest.fn();
  }),
}));

jest.mock('@/src/firebase/config', () => ({
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
  db: {},
}));

jest.mock('firebase/firestore', () => ({
  doc: jest.fn(),
  onSnapshot: jest.fn(() => jest.fn()),
}));

jest.mock('expo-web-browser', () => ({
  WebBrowserResultType: {
    DISMISS: 'dismiss',
  },
}));

jest.mock('@/src/services/TraktService', () => ({
  TraktRequestError: class TraktRequestError extends Error {
    category?: string;
    nextAllowedSyncAt?: string;
    constructor(message: string, options?: { category?: string; nextAllowedSyncAt?: string }) {
      super(message);
      this.category = options?.category;
      this.nextAllowedSyncAt = options?.nextAllowedSyncAt;
    }
  },
  checkEnrichmentStatus: jest.fn(),
  checkSyncStatus: jest.fn(),
  disconnectTrakt: jest.fn(),
  initiateOAuthFlow: jest.fn(),
  triggerEnrichment: jest.fn(),
  triggerSync: jest.fn(),
}));

jest.mock('@/src/services/TraktZipImportService', () => {
  const actual = jest.requireActual('@/src/services/TraktZipImportService');
  return {
    ...actual,
    traktZipImportService: {
      uploadZipFile: jest.fn(),
      startImport: jest.fn(),
      subscribeToProgress: jest.fn(() => jest.fn()),
    },
  };
});

describe('TraktContext render-count harness', () => {
  let queryClient: QueryClient;
  let renderCount: number;
  let latestContext: ReturnType<typeof useTrakt>;

  function TestConsumer() {
    const trakt = useTrakt();
    renderCount++;
    latestContext = trakt;
    return (
      <View>
        <Text testID="loading">{String(trakt.isLoading)}</Text>
        <Text testID="connected">{String(trakt.isConnected)}</Text>
        <Text testID="progress">{String(trakt.zipUploadProgress)}</Text>
        <Text testID="uiState">{trakt.zipImportUiState}</Text>
      </View>
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    renderCount = 0;
    mockCurrentUser = { uid: 'trakt-harness-user', isAnonymous: false };
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);
    (TraktService.checkEnrichmentStatus as jest.Mock).mockResolvedValue({
      lists: {},
      status: 'idle',
    });
    (TraktService.checkSyncStatus as jest.Mock).mockResolvedValue({
      connected: false,
      synced: false,
    });
  });

  it('measures exact render counts on the low-frequency path (mount hydration + checkSyncStatus)', async () => {
    render(
      <QueryClientProvider client={queryClient}>
        <TraktProvider>
          <TestConsumer />
        </TraktProvider>
      </QueryClientProvider>
    );

    // Initial render before AsyncStorage settles
    expect(renderCount).toBe(1);
    expect(latestContext.isLoading).toBe(true);

    // After AsyncStorage settles, exactly 1 additional render occurs
    await waitFor(() => {
      expect(latestContext.isLoading).toBe(false);
    });
    expect(renderCount).toBe(2);

    // Low-frequency action: checkSyncStatus updates connection and status.
    // Use recent timestamp so auto-sync cooldown does not trigger.
    (TraktService.checkSyncStatus as jest.Mock).mockResolvedValueOnce({
      connected: true,
      synced: true,
      status: 'completed',
      lastSyncedAt: new Date().toISOString(),
    });

    await act(async () => {
      await latestContext.checkSyncStatus();
    });

    // Exactly 1 additional render occurs when state updates
    expect(renderCount).toBe(3);
    expect(latestContext.isConnected).toBe(true);
    expect(latestContext.syncStatus?.status).toBe('completed');
  });

  it('measures exact render counts on the high-frequency path (zip upload progress with async gaps)', async () => {
    let capturedProgress: ((progress: number) => void) | null = null;
    let resolveUpload: (() => void) | null = null;

    (traktZipImportService.uploadZipFile as jest.Mock).mockImplementation(
      (_uid, _id, _uri, onProgress) => {
        capturedProgress = onProgress;
        return new Promise<void>((resolve) => {
          resolveUpload = resolve;
        });
      }
    );
    (traktZipImportService.startImport as jest.Mock).mockResolvedValue(undefined);

    render(
      <QueryClientProvider client={queryClient}>
        <TraktProvider>
          <TestConsumer />
        </TraktProvider>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(latestContext.isLoading).toBe(false);
    });

    // Baseline: 2 renders after mount and hydration
    expect(renderCount).toBe(2);

    let importPromise!: Promise<void>;
    act(() => {
      importPromise = latestContext.startZipImport({
        name: 'test.zip',
        size: 1024,
        uri: 'file://test.zip',
      });
    });

    // Render #3: zipImportUiState transitions to 'uploading'
    expect(renderCount).toBe(3);
    expect(latestContext.zipImportUiState).toBe('uploading');

    // Simulate 4 discrete progress updates with distinct event ticks
    act(() => {
      capturedProgress!(0.25);
    });
    expect(renderCount).toBe(4);
    expect(latestContext.zipUploadProgress).toBe(0.25);

    act(() => {
      capturedProgress!(0.5);
    });
    expect(renderCount).toBe(5);
    expect(latestContext.zipUploadProgress).toBe(0.5);

    act(() => {
      capturedProgress!(0.75);
    });
    expect(renderCount).toBe(6);
    expect(latestContext.zipUploadProgress).toBe(0.75);

    act(() => {
      capturedProgress!(1.0);
    });
    expect(renderCount).toBe(7);
    expect(latestContext.zipUploadProgress).toBe(1.0);

    // Resolve the upload
    await act(async () => {
      resolveUpload!();
      await importPromise;
    });

    // Render #8: zipImportUiState transitions to 'processing'
    expect(renderCount).toBe(8);
    expect(latestContext.zipImportUiState).toBe('processing');

    // Total delta across startZipImport upload phase: exactly 6 renders
    const deltaRenders = renderCount - 2;
    expect(deltaRenders).toBe(6);
  });
});
