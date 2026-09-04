/**
 * Hook for managing Trakt cloud sync state, polling, auto-sync, connection, and disconnection
 */

import { TRAKT_CONFIG, TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { TraktRequestError } from '@/src/services/TraktService';
import * as TraktService from '@/src/services/TraktService';
import type { SyncStatus } from '@/src/types/trakt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import type { User } from 'firebase/auth';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasEligibleTraktUser,
  isActiveSyncStatus,
  isLockedAccountStatus,
} from './helpers';

export interface UseTraktSyncOptions {
  user: User | null;
  ensureEligibleUser: (errorMessage: string) => User;
  isLoading: boolean;
  isZipImportingRef: React.RefObject<boolean>;
  isSyncingRef?: React.MutableRefObject<boolean>;
  onSyncCompleted?: () => Promise<void> | void;
  onDisconnect?: () => Promise<void> | void;
}

export function useTraktSync({
  user,
  ensureEligibleUser,
  isLoading,
  isZipImportingRef,
  isSyncingRef,
  onSyncCompleted,
  onDisconnect,
}: UseTraktSyncOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAttemptedAutoSync = useRef(false);

  const onSyncCompletedRef = useRef(onSyncCompleted);
  useEffect(() => {
    onSyncCompletedRef.current = onSyncCompleted;
  }, [onSyncCompleted]);

  const onDisconnectRef = useRef(onDisconnect);
  useEffect(() => {
    onDisconnectRef.current = onDisconnect;
  }, [onDisconnect]);

  // Sync isSyncingRef with state
  useEffect(() => {
    if (isSyncingRef) {
      isSyncingRef.current = isSyncing;
    }
  }, [isSyncing, isSyncingRef]);

  const clearSyncInterval = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const persistState = useCallback(
    async (
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
    },
    []
  );

  const checkSyncStatus = useCallback(async () => {
    if (!hasEligibleTraktUser(user)) return;

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
  }, [user, persistState]);

  const connectTrakt = useCallback(async () => {
    ensureEligibleUser('Must be logged in to connect Trakt');

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
  }, [ensureEligibleUser, checkSyncStatus]);

  const pollSyncStatus = useCallback(async () => {
    if (!hasEligibleTraktUser(user)) return;

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
          const syncDate = status.lastSyncedAt ? new Date(status.lastSyncedAt) : null;
          setLastSyncedAt(syncDate);
          await persistState(true, syncDate, status);
          console.log('[Trakt] Sync completed successfully');

          if (onSyncCompletedRef.current) {
            await onSyncCompletedRef.current();
          }
        } else if (status.status === 'failed') {
          await persistState(true, lastSyncedAt, status);
          console.error('[Trakt] Sync failed:', status.errors);
        }
      }

      return status;
    } catch (error) {
      console.error('[Trakt] Failed to poll sync status:', error);
    }
  }, [user, lastSyncedAt, persistState]);

  // Polling controller
  useEffect(() => {
    if (!hasEligibleTraktUser(user) || !syncStatus?.status) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsSyncing(false);
      return;
    }

    if (isActiveSyncStatus(syncStatus.status)) {
      setIsSyncing(true);

      if (!pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(
          pollSyncStatus,
          TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
        );
      }

      return;
    }

    setIsSyncing(false);
  }, [pollSyncStatus, syncStatus?.status, user]);

  const syncNow = useCallback(async () => {
    ensureEligibleUser('Must be logged in to sync');

    if (isSyncing || (isSyncingRef && isSyncingRef.current)) {
      console.log('[Trakt] Sync already in progress');
      return;
    }

    if (isZipImportingRef.current) {
      console.log('[Trakt] Zip import already in progress');
      throw new Error('A Trakt zip import is currently in progress.');
    }

    try {
      if (isSyncingRef) {
        isSyncingRef.current = true;
      }
      setIsSyncing(true);
      setSyncStatus((currentStatus) => ({
        connected: true,
        synced: Boolean(currentStatus?.lastSyncedAt),
        ...(currentStatus ?? {}),
        attempt: 0,
        diagnostics: undefined,
        errorCategory: undefined,
        errorMessage: undefined,
        errors: undefined,
        nextAllowedSyncAt: undefined,
        nextRetryAt: undefined,
        status: 'queued',
      }));

      await TraktService.triggerSync();
      const status = await pollSyncStatus();

      // Start polling for status updates
      if (status && isActiveSyncStatus(status.status) && !pollIntervalRef.current) {
        pollIntervalRef.current = setInterval(
          pollSyncStatus,
          TRAKT_CONFIG.SYNC_STATUS_POLL_INTERVAL_MS
        );
      }
    } catch (error) {
      console.error('[Trakt] Failed to trigger sync:', error);
      if (isSyncingRef) {
        isSyncingRef.current = false;
      }
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
  }, [ensureEligibleUser, isSyncing, isSyncingRef, isZipImportingRef, pollSyncStatus]);

  const disconnectTrakt = useCallback(async () => {
    ensureEligibleUser('Must be logged in to disconnect');

    try {
      await TraktService.disconnectTrakt();

      setIsConnected(false);
      setLastSyncedAt(null);
      setSyncStatus(null);

      await persistState(false, null, null);

      if (onDisconnectRef.current) {
        await onDisconnectRef.current();
      }

      console.log('[Trakt] Successfully disconnected');
    } catch (error) {
      console.error('[Trakt] Failed to disconnect:', error);
      throw error;
    }
  }, [ensureEligibleUser, persistState]);

  // Auto-sync on app launch if connected and cooldown has passed
  useEffect(() => {
    if (
      !hasEligibleTraktUser(user) ||
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
  }, [user, isConnected, isLoading, lastSyncedAt, syncStatus, syncNow]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, []);

  return {
    isConnected,
    isSyncing,
    syncStatus,
    lastSyncedAt,
    setIsConnected,
    setIsSyncing,
    setSyncStatus,
    setLastSyncedAt,
    connectTrakt,
    disconnectTrakt,
    syncNow,
    checkSyncStatus,
    pollSyncStatus,
    clearSyncInterval,
    persistState,
  };
}
