import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_RUNTIME_CONFIG,
  type RuntimeConfig,
} from '@/src/config/runtimeConfig';
import {
  fetchRuntimeConfigFromNetwork,
  loadRuntimeConfig,
  writeCachedRuntimeConfig,
} from '@/src/services/runtimeConfig';

const mockFetch = jest.fn();
const originalRuntimeConfigUrl = process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;
const originalFirebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('runtimeConfig service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL = 'https://showseek-app-2025.web.app/runtime-config.json';
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = 'showseek-app-2025';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  afterAll(() => {
    if (originalRuntimeConfigUrl === undefined) {
      delete process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;
    } else {
      process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL = originalRuntimeConfigUrl;
    }

    if (originalFirebaseProjectId === undefined) {
      delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
      return;
    }

    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID = originalFirebaseProjectId;
  });

  it('loads network config and caches it', async () => {
    const networkConfig: RuntimeConfig = {
      version: '2',
      firestoreClientEnabled: false,
      disableNonCriticalReads: true,
      allowGuestFirestoreReads: false,
      maintenanceTitle: 'Maintenance',
      maintenanceMessage: 'Temporarily unavailable',
      updatedAt: '2026-03-24T12:00:00.000Z',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => networkConfig,
    });

    const result = await loadRuntimeConfig();

    expect(result).toEqual({
      config: networkConfig,
      source: 'network',
    });
    expect(AsyncStorage.setItem).toHaveBeenCalled();
  });

  it('falls back to cached config when the network request fails', async () => {
    const cachedConfig: RuntimeConfig = {
      ...DEFAULT_RUNTIME_CONFIG,
      disableNonCriticalReads: true,
      version: 'cached',
    };

    await writeCachedRuntimeConfig(cachedConfig);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
      JSON.stringify({
        cachedAt: Date.now(),
        config: cachedConfig,
      })
    );
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    const result = await loadRuntimeConfig();

    expect(result).toEqual({
      config: cachedConfig,
      source: 'cache',
    });
  });

  it('falls back to the local default when neither cache nor network is available', async () => {
    mockFetch.mockRejectedValueOnce(new Error('offline'));

    const result = await loadRuntimeConfig();

    expect(result).toEqual({
      config: DEFAULT_RUNTIME_CONFIG,
      source: 'default',
    });
  });

  it('logs and returns the default config when no runtime config URL is configured', async () => {
    const consoleSpy = jest.spyOn(console, 'info').mockImplementation();
    delete process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;
    delete process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

    await expect(fetchRuntimeConfigFromNetwork()).resolves.toEqual(DEFAULT_RUNTIME_CONFIG);

    expect(consoleSpy).toHaveBeenCalledWith(
      '[runtimeConfig] No runtime config URL configured; using default config.',
      {
        explicitUrl: null,
        firebaseProjectId: null,
      }
    );
    consoleSpy.mockRestore();
  });

  it('clears the runtime config timeout once the network request resolves', async () => {
    jest.useFakeTimers();
    const networkConfig: RuntimeConfig = {
      version: '3',
      firestoreClientEnabled: true,
      disableNonCriticalReads: false,
      allowGuestFirestoreReads: false,
      maintenanceTitle: 'Maintenance',
      maintenanceMessage: 'Temporarily unavailable',
      updatedAt: '2026-03-24T12:30:00.000Z',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => networkConfig,
    });

    const resultPromise = fetchRuntimeConfigFromNetwork();
    await flushPromises();

    await expect(resultPromise).resolves.toEqual(networkConfig);
    expect(jest.getTimerCount()).toBe(0);
  });
});
