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

import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { auth, db } from '@/src/firebase/config';
import type {
  SyncStatus,
  TraktContextValue,
  TraktZipImportUIState,
} from '@/src/types/trakt';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  hasEligibleTraktUser,
  isActiveEnrichmentStatus,
  persistDismissedZipImportId,
} from './trakt/helpers';
import { useTraktEnrichment } from './trakt/useTraktEnrichment';
import { useTraktQueryInvalidation } from './trakt/useTraktQueryInvalidation';
import { useTraktSync } from './trakt/useTraktSync';
import { useTraktZipImport } from './trakt/useTraktZipImport';

export const [TraktProvider, useTrakt] = createContextHook<TraktContextValue>(() => {
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  const isSyncingRef = useRef(false);
  const isZipImportingRef = useRef(false);

  const ensureEligibleUser = useCallback(
    (errorMessage: string): User => {
      if (!hasEligibleTraktUser(user)) {
        throw new Error(errorMessage);
      }

      return user;
    },
    [user]
  );

  const prevEnrichmentStatusRef = useRef<string | undefined>(undefined);
  // Set once AsyncStorage dismissal hydration settles (success or failure).
  // Terminal snapshots arriving earlier are stashed and reprocessed after.
  const dismissalHydratedRef = useRef(false);
  const pendingTerminalSnapshotRef = useRef<{
    error?: string;
    importId: string | null;
    status: 'completed' | 'failed';
    userId: string;
  } | null>(null);

  const { invalidateUserLibraryQueries } = useTraktQueryInvalidation({ user });

  const {
    isEnriching,
    lastEnrichedAt,
    setIsEnriching,
    setLastEnrichedAt,
    enrichData,
    handleSyncCompleted,
    clearEnrichmentInterval,
  } = useTraktEnrichment({ user, ensureEligibleUser });

  const handleDisconnect = useCallback(async () => {
    setLastEnrichedAt(null);
    await AsyncStorage.removeItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED);
  }, [setLastEnrichedAt]);

  const {
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
    persistState,
  } = useTraktSync({
    user,
    ensureEligibleUser,
    isLoading,
    isZipImportingRef,
    isSyncingRef,
    onSyncCompleted: handleSyncCompleted,
    onDisconnect: handleDisconnect,
  });

  const {
    isZipImporting,
    isZipImportRateLimited,
    nextAllowedZipImportAt,
    zipImportUiState,
    zipUploadProgress,
    zipImportDoc,
    zipImportError,
    selectedZipFile,
    dismissedZipImportId,
    dismissedZipImportIdRef,
    lastSeenZipImportIdRef,
    setSelectedZipFile,
    setZipImportUiState,
    setNextAllowedZipImportAt,
    setDismissedZipImportId,
    startZipImport,
    dismissZipImport,
    clearZipHoldTimeout,
    subscribeToZipProgress,
    processTerminalZipSnapshot,
    resetZipImportState,
  } = useTraktZipImport({
    user,
    ensureEligibleUser,
    isSyncingRef,
    isZipImportingRef,
    dismissalHydratedRef,
    pendingTerminalSnapshotRef,
    invalidateUserLibraryQueries,
  });

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Real-time observer for background TMDB enrichment and zip import status on the user document
  useEffect(() => {
    if (!hasEligibleTraktUser(user)) {
      resetZipImportState();
      pendingTerminalSnapshotRef.current = null;
      setIsEnriching(false);
      return;
    }

    const userDocRef = doc(db, 'users', user.uid);
    const unsubscribe = onSnapshot(
      userDocRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          return;
        }

        const data = snapshot.data();
        const enrichmentStatus = data?.traktEnrichmentStatus;
        const currentStatus = enrichmentStatus?.status as
          | 'idle'
          | 'queued'
          | 'in_progress'
          | 'retrying'
          | 'completed'
          | 'failed'
          | undefined;

        const prevStatus = prevEnrichmentStatusRef.current;
        prevEnrichmentStatusRef.current = currentStatus;

        const isCurrentlyEnriching = isActiveEnrichmentStatus(currentStatus);
        setIsEnriching(isCurrentlyEnriching);

        if (currentStatus === 'completed') {
          if (enrichmentStatus?.completedAt) {
            const enrichedDate =
              typeof enrichmentStatus.completedAt?.toDate === 'function'
                ? enrichmentStatus.completedAt.toDate()
                : new Date(enrichmentStatus.completedAt);
            setLastEnrichedAt(enrichedDate);
            void AsyncStorage.setItem(TRAKT_STORAGE_KEYS.LAST_ENRICHED, enrichedDate.toISOString());
          }

          // If transitioning from an active state (queued/in_progress) to completed, invalidate library queries
          if (prevStatus && prevStatus !== 'completed') {
            console.log('[Trakt] Background enrichment completed. Invalidating library queries.');
            void invalidateUserLibraryQueries();
          }
        }

        // Observer for active Trakt zip import on user document
        const zipStatus = data?.traktZipImportStatus;
        if (zipStatus) {
          const zipImportId: string | null =
            zipStatus.id || (zipStatus as any).activeImportId || null;
          if (zipImportId) {
            lastSeenZipImportIdRef.current = zipImportId;
          }
          const wasDismissed =
            !!zipImportId && dismissedZipImportIdRef.current === zipImportId;
          const isZipActive = zipStatus.status === 'pending' || zipStatus.status === 'processing';
          if (isZipActive) {
            if (wasDismissed) {
              // Import became active again (e.g. retried server-side):
              // the previous dismissal no longer applies.
              dismissedZipImportIdRef.current = null;
              setDismissedZipImportId(null);
              void persistDismissedZipImportId(null);
            }
            // A hold timeout keyed to an older terminal snapshot must not
            // outlive the import becoming active again; the next terminal
            // snapshot re-arms the wait if needed.
            clearZipHoldTimeout();
            setZipImportUiState('processing');
            if (zipImportId) {
              subscribeToZipProgress(user.uid, zipImportId);
            }
          } else if (zipStatus.status === 'completed') {
            processTerminalZipSnapshot({
              userId: user.uid,
              importId: zipImportId,
              status: 'completed',
            });
          } else if (zipStatus.status === 'failed') {
            processTerminalZipSnapshot({
              userId: user.uid,
              importId: zipImportId,
              status: 'failed',
              error: zipStatus.error,
            });
          }

          const zipNextAllowedAt = zipStatus.nextAllowedImportAt;
          let parsedSnapshotNextAllowedAt: Date | null = null;
          if (zipNextAllowedAt && typeof zipNextAllowedAt.toDate === 'function') {
            const date = zipNextAllowedAt.toDate();
            if (date && typeof date.getTime === 'function' && !isNaN(date.getTime())) {
              parsedSnapshotNextAllowedAt = date;
            }
          }
          setNextAllowedZipImportAt(parsedSnapshotNextAllowedAt);
        } else {
          setNextAllowedZipImportAt(null);
        }
      },
      (error) => {
        console.warn('[Trakt] Error observing user document:', error);
      }
    );

    return () => {
      unsubscribe();
      resetZipImportState();
      pendingTerminalSnapshotRef.current = null;
    };
  }, [
    user,
    invalidateUserLibraryQueries,
    subscribeToZipProgress,
    processTerminalZipSnapshot,
    clearZipHoldTimeout,
    resetZipImportState,
    setNextAllowedZipImportAt,
    setZipImportUiState,
    setDismissedZipImportId,
    lastSeenZipImportIdRef,
    dismissedZipImportIdRef,
    setIsEnriching,
    setLastEnrichedAt,
  ]);

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

  // Cleanup polling intervals on unmount
  useEffect(() => {
    return () => {
      clearEnrichmentInterval();
      clearZipHoldTimeout();
    };
  }, [clearEnrichmentInterval, clearZipHoldTimeout]);

  return {
    isConnected,
    isSyncing,
    isEnriching,
    isZipImporting,
    isZipImportRateLimited,
    lastSyncedAt,
    lastEnrichedAt,
    nextAllowedZipImportAt,
    syncStatus,
    zipImportUiState,
    zipUploadProgress,
    zipImportDoc,
    zipImportError,
    selectedZipFile,
    isLoading,
    connectTrakt,
    disconnectTrakt,
    syncNow,
    checkSyncStatus,
    enrichData,
    startZipImport,
    dismissZipImport,
    setSelectedZipFile,
  };
});
