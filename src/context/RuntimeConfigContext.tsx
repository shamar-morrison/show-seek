import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  DEFAULT_RUNTIME_CONFIG,
  RUNTIME_CONFIG_REFRESH_COOLDOWN_MS,
  type RuntimeConfig,
} from '@/src/config/runtimeConfig';
import { loadRuntimeConfig, readCachedRuntimeConfig } from '@/src/services/runtimeConfig';

type RuntimeConfigSource = 'cache' | 'network' | 'default';

interface RuntimeConfigContextValue {
  config: RuntimeConfig;
  isReady: boolean;
  isRefreshing: boolean;
  source: RuntimeConfigSource;
  refreshConfig: (force?: boolean) => Promise<void>;
}

const defaultContextValue: RuntimeConfigContextValue = {
  config: DEFAULT_RUNTIME_CONFIG,
  isReady: true,
  isRefreshing: false,
  source: 'default',
  refreshConfig: async () => {},
};

const RuntimeConfigContext = createContext<RuntimeConfigContextValue>(defaultContextValue);

export function RuntimeConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState(DEFAULT_RUNTIME_CONFIG);
  const [isReady, setIsReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [source, setSource] = useState<RuntimeConfigSource>('default');
  const lastRefreshAtRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refreshConfig = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastRefreshAtRef.current < RUNTIME_CONFIG_REFRESH_COOLDOWN_MS) {
      return;
    }

    if (refreshPromiseRef.current) {
      return refreshPromiseRef.current;
    }

    const nextRefresh = (async () => {
      setIsRefreshing(true);

      try {
        const result = await loadRuntimeConfig();
        setConfig(result.config);
        setSource(result.source);
        lastRefreshAtRef.current = Date.now();
      } finally {
        setIsRefreshing(false);
        setIsReady(true);
        refreshPromiseRef.current = null;
      }
    })();

    refreshPromiseRef.current = nextRefresh;
    return nextRefresh;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const bootstrap = async () => {
      try {
        const cached = await readCachedRuntimeConfig();
        if (cached && isMounted) {
          setConfig(cached.config);
          setSource('cache');
          setIsReady(true);
        }
      } catch (error) {
        console.warn('[runtimeConfig] Failed to read cached config:', error);
      }

      if (isMounted) {
        await refreshConfig(true);
      }
    };

    void bootstrap();

    return () => {
      isMounted = false;
    };
  }, [refreshConfig]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshConfig(false);
      }
    });

    return () => subscription.remove();
  }, [refreshConfig]);

  const value = useMemo(
    () => ({
      config,
      isReady,
      isRefreshing,
      source,
      refreshConfig,
    }),
    [config, isReady, isRefreshing, source, refreshConfig]
  );

  return <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>;
}

export const useRuntimeConfig = () => useContext(RuntimeConfigContext);

