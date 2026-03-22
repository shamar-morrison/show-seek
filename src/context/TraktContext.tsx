/**
 * Trakt Context
 *
 * Provides state management for Trakt integration across the app.
 * Uses the same pattern as AuthProvider with @nkzw/create-context-hook.
 *
 * Features:
 * - Connection state persistence via AsyncStorage
 * - Auto-sync on app launch with cooldown to prevent rapid syncing
 * - Premium-only gating (integration only available to premium users)
 */

import { TRAKT_CONFIG, TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { auth } from '@/src/firebase/config';
import { TraktRequestError } from '@/src/services/TraktService';
import * as TraktService from '@/src/services/TraktService';
import type { SyncStatus, TraktContextValue } from '@/src/types/trakt';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';

const isActiveSyncStatus = (status?: SyncStatus['status']): boolean =>
  status === 'queued' || status === 'in_progress' || status === 'retrying';

const isActiveEnrichmentStatus = (
  status?: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed'
): boolean => status === 'queued' || status === 'in_progress' || status === 'retrying';

const isLockedAccountStatus = (status?: SyncStatus | null): boolean =>
  status?.status === 'failed' && status.errorCategory === 'locked_account';

export const [TraktProvider, useTrakt] = createContextHook<TraktContextValue>(() => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastEnrichedAt, setLastEnrichedAt] = useState<Date | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichmentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAttemptedAutoSync = useRef(false);

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Load persisted state from AsyncStorage
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        const [connectedStr, lastSyncedStr, syncStatusStr, lastEnrichedStr] = await Promise.all([
          AsyncStorage.getItem(TRAKT_STORAGE_KEYS.CONNECTED),
          AsyncStorage.getItem(TRAKT_STORAGE_KEYS.LAST_SYNCED),
          AsyncStorage.getItem(TRAKT_STORAGE_KEYS.SYNC_STATUS),
          AsyncStorage.getItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED),
        ]);

        if (connectedStr === 'true') {
          setIsConnected(true);
        }

        if (lastSyncedStr) {
          setLastSyncedAt(new Date(lastSyncedStr));
        }

        if (syncStatusStr) {
          setSyncStatus(JSON.parse(syncStatusStr));
        }

        if (lastEnrichedStr) {
          setLastEnrichedAt(new Date(lastEnrichedStr));
        }
      } catch (error) {
        console.error('[Trakt] Failed to load persisted state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadPersistedState();
  }, []);

  // Auto-sync on app launch if connected and cooldown has passed
  useEffect(() => {
    if (
      !user ||
      !isConnected ||
      isLoading ||
      hasAttemptedAutoSync.current ||
      isLockedAccountStatus(syncStatus) ||
      isActiveSyncStatus(syncStatus?.status)
    ) {
      return;
    }

    hasAttemptedAutoSync.current = true;

    const shouldAutoSync = () => {
      if (!lastSyncedAt) return false; // Don't auto-sync if never synced (user should trigger initial)

      const timeSinceLastSync = Date.now() - lastSyncedAt.getTime();
      return timeSinceLastSync >= TRAKT_CONFIG.AUTO_SYNC_COOLDOWN_MS;
    };

    if (shouldAutoSync()) {
      console.log('[Trakt] Auto-sync triggered (cooldown passed)');
      syncNow();
    } else {
      console.log('[Trakt] Skipping auto-sync (cooldown not passed or never synced)');
    }
  }, [user, isConnected, isLoading, lastSyncedAt, syncStatus]);

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (enrichmentIntervalRef.current) {
        clearInterval(enrichmentIntervalRef.current);
      }
    };
  }, []);

  const persistState = async (
    connected: boolean,
    lastSynced: Date | null,
    status: SyncStatus | null
  ) => {
    try {
      await Promise.all([
        AsyncStorage.setItem(TRAKT_STORAGE_KEYS.CONNECTED, String(connected)),
        lastSynced
          ? AsyncStorage.setItem(TRAKT_STORAGE_KEYS.LAST_SYNCED, lastSynced.toISOString())
          : AsyncStorage.removeItem(TRAKT_STORAGE_KEYS.LAST_SYNCED),
        status
          ? AsyncStorage.setItem(TRAKT_STORAGE_KEYS.SYNC_STATUS, JSON.stringify(status))
          : AsyncStorage.removeItem(TRAKT_STORAGE_KEYS.SYNC_STATUS),
      ]);
    } catch (error) {
      console.error('[Trakt] Failed to persist state:', error);
    }
  };

  const checkSyncStatus = useCallback(async () => {
    if (!user) return;

    try {
      const status = await TraktService.checkSyncStatus();
      setSyncStatus(status);
      setIsConnected(status.connected);
      setIsSyncing(isActiveSyncStatus(status.status));

      if (status.lastSyncedAt) {
        const syncDate = new Date(status.lastSyncedAt);
        setLastSyncedAt(syncDate);
        await persistState(status.connected, syncDate, status);
      } else {
        await persistState(status.connected, null, status);
      }

      return status;
    } catch (error) {
      console.error('[Trakt] Failed to check sync status:', error);
      throw error;
    }
  }, [user]);

  const connectTrakt = useCallback(async () => {
    if (!user) {
      throw new Error('Must be logged in to connect Trakt');
    }

    try {
      const result = await TraktService.initiateOAuthFlow();

      if (
        result.type === WebBrowser.WebBrowserResultType.DISMISS ||
        result.type === 'success'
      ) {
        // Wait for backend to process the callback
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Check if connection was successful
        const status = await checkSyncStatus();
        if (status?.connected) {
          console.log('[Trakt] Successfully connected');
        }
      }
    } catch (error) {
      console.error('[Trakt] OAuth flow failed:', error);
      throw error;
    }
  }, [user, checkSyncStatus]);

  const pollSyncStatus = useCallback(async () => {
    if (!user) return;

    try {
      const status = await TraktService.checkSyncStatus();
      setSyncStatus(status);
      setIsSyncing(isActiveSyncStatus(status.status));

      if (status.status === 'completed' || status.status === 'failed') {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }

        setIsSyncing(false);

        if (status.status === 'completed') {
          const syncDate = status.lastSyncedAt ? new Date(status.lastSyncedAt) : lastSyncedAt;
          if (syncDate) {
            setLastSyncedAt(syncDate);
          }
          await persistState(true, syncDate ?? null, status);
          console.log('[Trakt] Sync completed successfully');

          try {
            const enrichmentStatus = await TraktService.checkEnrichmentStatus();
            const enrichmentActive = isActiveEnrichmentStatus(enrichmentStatus.status);
            setIsEnriching(enrichmentActive);

            if (enrichmentActive && !enrichmentIntervalRef.current) {
              enrichmentIntervalRef.current = setInterval(
                pollEnrichmentStatus,
                TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
              );
            } else if (enrichmentStatus.status === 'completed' && enrichmentStatus.completedAt) {
              const enrichedDate = new Date(enrichmentStatus.completedAt);
              setLastEnrichedAt(enrichedDate);
              await AsyncStorage.setItem(
                TRAKT_STORAGE_KEYS.LAST_ENRICHED,
                enrichedDate.toISOString()
              );
            }
          } catch (enrichmentError) {
            console.warn(
              '[Trakt] Failed to fetch enrichment status after sync completion:',
              enrichmentError
            );
          }
        } else if (status.status === 'failed') {
          await persistState(true, lastSyncedAt, status);
          console.error('[Trakt] Sync failed:', status.errors);
        }
      }
    } catch (error) {
      console.error('[Trakt] Failed to poll sync status:', error);
    }
  }, [user]);

  const pollEnrichmentStatus = useCallback(async () => {
    if (!user) return;

    try {
      const status = await TraktService.checkEnrichmentStatus();
      const enrichmentActive = isActiveEnrichmentStatus(status.status);
      setIsEnriching(enrichmentActive);

      if (enrichmentActive) {
        return;
      }

      if (enrichmentIntervalRef.current) {
        clearInterval(enrichmentIntervalRef.current);
        enrichmentIntervalRef.current = null;
      }

      if (status.status === 'completed') {
        const enrichedDate = status.completedAt ? new Date(status.completedAt) : new Date();
        setLastEnrichedAt(enrichedDate);
        await AsyncStorage.setItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED, enrichedDate.toISOString());
        console.log('[Trakt] Enrichment completed successfully');
      } else if (status.status === 'failed') {
        console.error('[Trakt] Enrichment failed:', status.errors);
      }
    } catch (error) {
      console.error('[Trakt] Failed to poll enrichment status:', error);
      // Don't stop polling on error, might be transient
    }
  }, [user]);

  useEffect(() => {
    if (!user || !syncStatus?.status) {
      return;
    }

    if (isActiveSyncStatus(syncStatus.status)) {
      setIsSyncing(true);

      if (!pollIntervalRef.current) {
        void pollSyncStatus();
        pollIntervalRef.current = setInterval(
          pollSyncStatus,
          TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
        );
      }

      return;
    }

    setIsSyncing(false);
  }, [user, syncStatus?.status, pollSyncStatus]);

  const syncNow = useCallback(async () => {
    if (!user) {
      throw new Error('Must be logged in to sync');
    }

    if (isSyncing) {
      console.log('[Trakt] Sync already in progress');
      return;
    }

    try {
      setIsSyncing(true);
      setSyncStatus((currentStatus) => ({
        connected: true,
        synced: Boolean(currentStatus?.lastSyncedAt),
        ...(currentStatus ?? {}),
        errorCategory: undefined,
        errorMessage: undefined,
        errors: undefined,
        status: 'queued',
      }));

      await TraktService.triggerSync();

      // Start polling for status updates
      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(
          pollSyncStatus,
          TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
        );
      }
    } catch (error) {
      console.error('[Trakt] Failed to trigger sync:', error);
      setIsSyncing(false);

      if (error instanceof TraktRequestError && error.category === 'rate_limited') {
        setSyncStatus((currentStatus) => ({
          connected: true,
          synced: Boolean(currentStatus?.lastSyncedAt),
          ...(currentStatus ?? {}),
          errorCategory: 'rate_limited',
          errorMessage: error.message,
          nextAllowedSyncAt: error.nextAllowedSyncAt,
          status: 'failed',
        }));
      }

      throw error;
    }
  }, [user, isSyncing, pollSyncStatus]);

  const disconnectTrakt = useCallback(async () => {
    if (!user) {
      throw new Error('Must be logged in to disconnect');
    }

    try {
      await TraktService.disconnectTrakt();

      setIsConnected(false);
      setLastSyncedAt(null);
      setLastEnrichedAt(null);
      setSyncStatus(null);

      await persistState(false, null, null);
      await AsyncStorage.removeItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED);

      console.log('[Trakt] Successfully disconnected');
    } catch (error) {
      console.error('[Trakt] Failed to disconnect:', error);
      throw error;
    }
  }, [user, lastSyncedAt]);

  const enrichData = useCallback(async () => {
    if (!user) {
      throw new Error('Must be logged in to enrich data');
    }

    if (isEnriching) {
      console.log('[Trakt] Enrichment already in progress');
      return;
    }

    try {
      setIsEnriching(true);

      await TraktService.triggerEnrichment({
        includeEpisodes: true, // Include episodes in enrichment to test new backend cache
      });

      // Start polling for enrichment status
      if (!enrichmentIntervalRef.current) {
        enrichmentIntervalRef.current = setInterval(
          pollEnrichmentStatus,
          TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
        );
      }
    } catch (error) {
      console.error('[Trakt] Failed to trigger enrichment:', error);
      setIsEnriching(false);
      throw error;
    }
  }, [user, isEnriching, pollEnrichmentStatus]);

  return {
    isConnected,
    isSyncing,
    isEnriching,
    lastSyncedAt,
    lastEnrichedAt,
    syncStatus,
    isLoading,
    connectTrakt,
    disconnectTrakt,
    syncNow,
    checkSyncStatus,
    enrichData,
  };
});
