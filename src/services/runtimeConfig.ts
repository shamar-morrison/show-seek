import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_RUNTIME_CONFIG,
  getRuntimeConfigUrl,
  normalizeRuntimeConfig,
  RUNTIME_CONFIG_FETCH_TIMEOUT_MS,
  RUNTIME_CONFIG_STORAGE_KEY,
  type RuntimeConfig,
} from '@/src/config/runtimeConfig';

interface StoredRuntimeConfig {
  cachedAt: number;
  config: RuntimeConfig;
}

const parseStoredRuntimeConfig = (value: string | null): StoredRuntimeConfig | null => {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<StoredRuntimeConfig> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.config) {
      return null;
    }

    return {
      cachedAt: typeof parsed.cachedAt === 'number' ? parsed.cachedAt : Date.now(),
      config: normalizeRuntimeConfig(parsed.config),
    };
  } catch (error) {
    console.warn('[runtimeConfig] Failed to parse cached config:', error);
    return null;
  }
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const clearTimer = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  try {
    return await Promise.race([
      promise.finally(clearTimer),
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Runtime config request timed out'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimer();
  }
};

export async function readCachedRuntimeConfig(): Promise<StoredRuntimeConfig | null> {
  const raw = await AsyncStorage.getItem(RUNTIME_CONFIG_STORAGE_KEY);
  return parseStoredRuntimeConfig(raw);
}

export async function writeCachedRuntimeConfig(config: RuntimeConfig): Promise<void> {
  const payload: StoredRuntimeConfig = {
    cachedAt: Date.now(),
    config: normalizeRuntimeConfig(config),
  };

  await AsyncStorage.setItem(RUNTIME_CONFIG_STORAGE_KEY, JSON.stringify(payload));
}

export async function fetchRuntimeConfigFromNetwork(): Promise<RuntimeConfig> {
  const runtimeConfigUrl = getRuntimeConfigUrl();
  if (!runtimeConfigUrl) {
    console.info('[runtimeConfig] No runtime config URL configured; using default config.', {
      explicitUrl: process.env.EXPO_PUBLIC_RUNTIME_CONFIG_URL ?? null,
      firebaseProjectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? null,
    });
    return DEFAULT_RUNTIME_CONFIG;
  }

  const response = await withTimeout(
    fetch(runtimeConfigUrl, {
      headers: {
        Accept: 'application/json',
      },
    }),
    RUNTIME_CONFIG_FETCH_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Runtime config request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  return normalizeRuntimeConfig(payload);
}

export async function loadRuntimeConfig(): Promise<{
  config: RuntimeConfig;
  source: 'cache' | 'network' | 'default';
}> {
  const cached = await readCachedRuntimeConfig();

  try {
    const config = await fetchRuntimeConfigFromNetwork();
    await writeCachedRuntimeConfig(config);
    return {
      config,
      source: 'network',
    };
  } catch (error) {
    if (cached) {
      console.warn('[runtimeConfig] Falling back to cached config:', error);
      return {
        config: cached.config,
        source: 'cache',
      };
    }

    console.warn('[runtimeConfig] Falling back to default config:', error);
    return {
      config: DEFAULT_RUNTIME_CONFIG,
      source: 'default',
    };
  }
}
