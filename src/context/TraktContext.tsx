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
import { auth } from '@/src/firebase/config';
import type { TraktContextValue } from '@/src/types/trakt';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onAuthStateChanged, User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasEligibleTraktUser } from './trakt/helpers';
import { useTraktEnrichment } from './trakt/useTraktEnrichment';
import { useTraktPersistence } from './trakt/useTraktPersistence';
import { useTraktQueryInvalidation } from './trakt/useTraktQueryInvalidation';
import { useTraktSync } from './trakt/useTraktSync';
import { useTraktUserDocObserver } from './trakt/useTraktUserDocObserver';
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
    setSyncStatus,
    setLastSyncedAt,
    connectTrakt,
    disconnectTrakt,
    syncNow,
    checkSyncStatus,
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

  useTraktUserDocObserver({
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
    pendingTerminalSnapshotRef,
  });

  useTraktPersistence({
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
  });

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
