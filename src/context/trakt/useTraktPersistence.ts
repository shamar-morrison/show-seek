/**
 * Hook for hydrating Trakt state from AsyncStorage on app launch
 */

import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import type { SyncStatus } from '@/src/types/trakt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type React from 'react';
import { useEffect } from 'react';

export interface UseTraktPersistenceOptions {
  setDismissedZipImportId: (id: string | null) => void;
  dismissedZipImportIdRef: React.MutableRefObject<string | null>;
  setIsConnected: (connected: boolean) => void;
  setLastSyncedAt: (date: Date | null) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setLastEnrichedAt: (date: Date | null) => void;
  setIsLoading: (loading: boolean) => void;
  processTerminalZipSnapshot: (params: {
    userId: string;
    importId: string | null;
    status: 'completed' | 'failed';
    error?: string;
  }) => void;
  dismissalHydratedRef: React.MutableRefObject<boolean>;
  pendingTerminalSnapshotRef: React.MutableRefObject<{
    error?: string;
    importId: string | null;
    status: 'completed' | 'failed';
    userId: string;
  } | null>;
}

export function useTraktPersistence({
  setDismissedZipImportId,
  dismissedZipImportIdRef,
  setIsConnected,
  setLastSyncedAt,
  setSyncStatus,
  setLastEnrichedAt,
  setIsLoading,
  processTerminalZipSnapshot,
  dismissalHydratedRef,
  pendingTerminalSnapshotRef,
}: UseTraktPersistenceOptions) {
  // Load persisted state from AsyncStorage
  useEffect(() => {
    const loadPersistedState = async () => {
      try {
        const [connectedStr, lastSyncedStr, syncStatusStr, lastEnrichedStr, dismissedZipId] =
          await Promise.all([
            AsyncStorage.getItem(TRAKT_STORAGE_KEYS.CONNECTED),
            AsyncStorage.getItem(TRAKT_STORAGE_KEYS.LAST_SYNCED),
            AsyncStorage.getItem(TRAKT_STORAGE_KEYS.SYNC_STATUS),
            AsyncStorage.getItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED),
            AsyncStorage.getItem(TRAKT_STORAGE_KEYS.DISMISSED_ZIP_IMPORT_ID),
          ]);

        if (dismissedZipId) {
          dismissedZipImportIdRef.current = dismissedZipId;
          setDismissedZipImportId(dismissedZipId);
        }

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
        dismissalHydratedRef.current = true;
        // Reprocess any terminal snapshot that arrived before hydration
        // finished, now that the dismissal check can run accurately.
        const pending = pendingTerminalSnapshotRef.current;
        pendingTerminalSnapshotRef.current = null;
        if (pending) {
          processTerminalZipSnapshot(pending);
        }
        setIsLoading(false);
      }
    };

    loadPersistedState();
  }, [processTerminalZipSnapshot]);
}
