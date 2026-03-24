import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_RUNTIME_CONFIG,
  type RuntimeConfig,
} from '@/src/config/runtimeConfig';
import { loadRuntimeConfig, writeCachedRuntimeConfig } from '@/src/services/runtimeConfig';

const mockFetch = jest.fn();
const originalRuntimeConfigUrl = process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;

describe('runtimeConfig service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = mockFetch as unknown as typeof fetch;
    process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL = 'https://showseek-app-2025.web.app/runtime-config.json';
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
  });

  afterAll(() => {
    if (originalRuntimeConfigUrl === undefined) {
      delete process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL;
      return;
    }

    process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL = originalRuntimeConfigUrl;
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
});
