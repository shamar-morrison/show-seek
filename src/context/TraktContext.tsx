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
import {
  generateImportId,
  SelectedZipFile,
  traktZipImportService,
  TraktZipImportProgressDoc,
  TraktZipRateLimitedError,
  TraktZipUploadError,
} from '@/src/services/TraktZipImportService';
import type {
  SyncStatus,
  TraktContextValue,
  TraktZipImportUIState,
} from '@/src/types/trakt';
import createContextHook from '@nkzw/create-context-hook';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDistanceToNow } from 'date-fns';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ZIP_COOLDOWN_TICK_INTERVAL_MS,
  ZIP_HOLD_FOR_DOC_TIMEOUT_MS,
} from './trakt/constants';
import {
  getDateFnsLocale,
  hasEligibleTraktUser,
  isActiveEnrichmentStatus,
  persistDismissedZipImportId,
} from './trakt/helpers';
import { useTraktEnrichment } from './trakt/useTraktEnrichment';
import { useTraktQueryInvalidation } from './trakt/useTraktQueryInvalidation';
import { useTraktSync } from './trakt/useTraktSync';

export const [TraktProvider, useTrakt] = createContextHook<TraktContextValue>(() => {
  const { t, i18n } = useTranslation();
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

  // Zip Import state
  const [zipImportUiState, setZipImportUiState] = useState<TraktZipImportUIState>('idle');
  const [selectedZipFile, setSelectedZipFile] = useState<SelectedZipFile | null>(null);
  const [zipUploadProgress, setZipUploadProgress] = useState(0);
  const [zipImportDoc, setZipImportDoc] = useState<TraktZipImportProgressDoc | null>(null);
  const [zipImportError, setZipImportError] = useState<string | null>(null);
  const [nextAllowedZipImportAt, setNextAllowedZipImportAt] = useState<Date | null>(null);
  const [zipCooldownTick, setZipCooldownTick] = useState(0);
  // Import id the user has explicitly dismissed via Done. Terminal server
  // statuses for this id are ignored so the summary can't resurrect (with
  // null stats) on later snapshots. Persisted so dismissal survives restarts.
  const [dismissedZipImportId, setDismissedZipImportId] = useState<string | null>(null);

  const prevEnrichmentStatusRef = useRef<string | undefined>(undefined);
  const activeZipImportSubscriptionRef = useRef<(() => void) | null>(null);
  const activeZipImportIdRef = useRef<string | null>(null);
  const dismissedZipImportIdRef = useRef<string | null>(null);
  const lastSeenZipImportIdRef = useRef<string | null>(null);
  const zipImportDocIdRef = useRef<string | null>(null);
  const zipImportDocRef = useRef<TraktZipImportProgressDoc | null>(null);
  // Set once AsyncStorage dismissal hydration settles (success or failure).
  // Terminal snapshots arriving earlier are stashed and reprocessed after.
  const dismissalHydratedRef = useRef(false);
  const pendingTerminalSnapshotRef = useRef<{
    error?: string;
    importId: string | null;
    status: 'completed' | 'failed';
    userId: string;
  } | null>(null);
  // Hold-state timeout: fires if the progress doc never arrives after a
  // terminal user-doc snapshot. Keyed to the import id it was started for.
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimeoutImportIdRef = useRef<string | null>(null);

  const clearZipHoldTimeout = useCallback(() => {
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
    holdTimeoutImportIdRef.current = null;
  }, []);

  // Keep refs in sync without adding state deps to the snapshot observer.
  useEffect(() => {
    dismissedZipImportIdRef.current = dismissedZipImportId;
  }, [dismissedZipImportId]);

  useEffect(() => {
    zipImportDocIdRef.current = zipImportDoc?.id ?? null;
    zipImportDocRef.current = zipImportDoc;
    // Progress doc arrived: no longer holding for it.
    if (zipImportDoc && holdTimeoutImportIdRef.current === zipImportDoc.id) {
      clearZipHoldTimeout();
    }
  }, [zipImportDoc, clearZipHoldTimeout]);

  const isZipImporting = zipImportUiState === 'uploading' || zipImportUiState === 'processing';
  useEffect(() => {
    isZipImportingRef.current = isZipImporting;
  }, [isZipImporting]);

  const isZipImportRateLimited =
    nextAllowedZipImportAt !== null && nextAllowedZipImportAt.getTime() > Date.now();

  useEffect(() => {
    if (!nextAllowedZipImportAt || nextAllowedZipImportAt.getTime() <= Date.now()) {
      return;
    }

    const interval = setInterval(() => {
      setZipCooldownTick((t) => t + 1);
      if (nextAllowedZipImportAt.getTime() <= Date.now()) {
        clearInterval(interval);
      }
    }, ZIP_COOLDOWN_TICK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [nextAllowedZipImportAt]);

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

  // Latest translate fn for use inside timeouts (avoids adding t to effect deps).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  const subscribeToZipProgress = useCallback(
    (userId: string, importId: string) => {
      if (activeZipImportIdRef.current === importId && activeZipImportSubscriptionRef.current) {
        return;
      }

      if (activeZipImportSubscriptionRef.current) {
        activeZipImportSubscriptionRef.current();
        activeZipImportSubscriptionRef.current = null;
      }

      activeZipImportIdRef.current = importId;

      const unsubscribe = traktZipImportService.subscribeToProgress(
        userId,
        importId,
        (data) => {
          // A dismissed import's terminal state must never resurface via
          // this path, regardless of when hydration completes.
          if (data.id && data.id === dismissedZipImportIdRef.current) {
            return;
          }
          setZipImportDoc(data);

          if (data.status === 'completed') {
            setZipImportUiState('completed');
            void invalidateUserLibraryQueries();
          } else if (data.status === 'failed') {
            setZipImportUiState('failed');
            setZipImportError(data.error || 'Import failed.');
          } else if (data.status === 'pending' || data.status === 'processing') {
            setZipImportUiState('processing');
          }
        },
        (subError) => {
          console.error('[TraktContext] Progress subscription error:', subError);
          setZipImportUiState('failed');
          setZipImportError(subError.message || 'Failed to track import progress.');
        }
      );

      activeZipImportSubscriptionRef.current = unsubscribe;
    },
    [invalidateUserLibraryQueries]
  );

  /**
   * Handles a terminal (completed/failed) zip import status from the user
   * document. Never shows a terminal view without a matching non-null
   * progress doc: if the user-doc snapshot wins the race, hold at
   * processing and hydrate first. Shared 60s hold-timeout bounds the wait
   * for the genuinely-diverged case (progress doc never written).
   */
  const processTerminalZipSnapshot = useCallback(
    (params: {
      userId: string;
      importId: string | null;
      status: 'completed' | 'failed';
      error?: string;
    }) => {
      const { userId, importId, status, error } = params;

      // Defer until dismissal hydration settles so a previously-dismissed
      // import can't resurface on relaunch. Cooldown parsing stays on the
      // caller path and is unaffected.
      if (!dismissalHydratedRef.current) {
        if (importId) {
          pendingTerminalSnapshotRef.current = { error, importId, status, userId };
        }
        return;
      }

      if (importId && dismissedZipImportIdRef.current === importId) {
        return;
      }

      const haveDocForSnapshot =
        !!importId &&
        zipImportDocIdRef.current === importId &&
        zipImportDocRef.current !== null;
      if (haveDocForSnapshot) {
        clearZipHoldTimeout();
        if (status === 'completed') {
          setZipImportUiState('completed');
          void invalidateUserLibraryQueries();
        } else {
          setZipImportUiState('failed');
          setZipImportError(error || 'Import failed.');
        }
        return;
      }

      // Terminal user-doc snapshot without a local progress doc (fresh
      // launch, in-flight race, or failed-path divergence): hold at
      // processing and hydrate instead of rendering zeros.
      if (importId) {
        setZipImportUiState('processing');
        subscribeToZipProgress(userId, importId);
        const scheduleFallback = () =>
          tRef.current('trakt.zipImport.statusUnavailable', {
            defaultValue: 'Import status is unavailable. Please try again.',
          });
        clearZipHoldTimeout();
        holdTimeoutImportIdRef.current = importId;
        holdTimeoutRef.current = setTimeout(() => {
          // Re-verify still holding for the same import with no doc: a late
          // timer must never clobber a newer import's state.
          if (holdTimeoutImportIdRef.current !== importId) {
            return;
          }
          if (zipImportDocRef.current?.id === importId) {
            return;
          }
          holdTimeoutRef.current = null;
          holdTimeoutImportIdRef.current = null;
          setZipImportUiState('failed');
          setZipImportError(scheduleFallback());
        }, ZIP_HOLD_FOR_DOC_TIMEOUT_MS);
      }
    },
    [clearZipHoldTimeout, invalidateUserLibraryQueries, subscribeToZipProgress]
  );

  // Monitor auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Real-time observer for background TMDB enrichment and zip import status on the user document
  useEffect(() => {
    if (!hasEligibleTraktUser(user)) {
      if (activeZipImportSubscriptionRef.current) {
        activeZipImportSubscriptionRef.current();
        activeZipImportSubscriptionRef.current = null;
      }
      activeZipImportIdRef.current = null;
      pendingTerminalSnapshotRef.current = null;
      clearZipHoldTimeout();
      setIsEnriching(false);
      setZipImportUiState('idle');
      setSelectedZipFile(null);
      setZipUploadProgress(0);
      setZipImportDoc(null);
      setZipImportError(null);
      setNextAllowedZipImportAt(null);
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
      if (activeZipImportSubscriptionRef.current) {
        activeZipImportSubscriptionRef.current();
        activeZipImportSubscriptionRef.current = null;
      }
      activeZipImportIdRef.current = null;
      pendingTerminalSnapshotRef.current = null;
      clearZipHoldTimeout();
      setZipImportUiState('idle');
      setSelectedZipFile(null);
      setZipUploadProgress(0);
      setZipImportDoc(null);
      setZipImportError(null);
      setNextAllowedZipImportAt(null);
    };
  }, [user, invalidateUserLibraryQueries, subscribeToZipProgress, processTerminalZipSnapshot, clearZipHoldTimeout]);

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

  const startZipImport = useCallback(
    async (file: SelectedZipFile) => {
      const eligibleUser = ensureEligibleUser('Must be logged in to import Trakt archive');

      if (isSyncing || isSyncingRef.current) {
        throw new Error('A Trakt sync is already in progress.');
      }

      if (isZipImporting || isZipImportingRef.current) {
        throw new Error('A Trakt zip import is already in progress.');
      }

      isZipImportingRef.current = true;
      setSelectedZipFile(file);
      setZipImportUiState('uploading');
      setZipUploadProgress(0);
      setZipImportError(null);
      // A new import supersedes any previous dismissal.
      dismissedZipImportIdRef.current = null;
      setDismissedZipImportId(null);
      void persistDismissedZipImportId(null);

      const importId = generateImportId();

      try {
        await traktZipImportService.uploadZipFile(
          eligibleUser.uid,
          importId,
          file.uri,
          (progress) => {
            setZipUploadProgress(progress);
          }
        );

        setZipImportUiState('processing');
        subscribeToZipProgress(eligibleUser.uid, importId);
        await traktZipImportService.startImport(importId);
      } catch (error) {
        isZipImportingRef.current = false;
        console.error('[TraktContext] Zip import error:', error);
        setZipImportUiState('failed');

        if (error instanceof TraktZipRateLimitedError) {
          let parsedNextAllowedAt: Date | null = null;
          if (error.nextAllowedImportAt) {
            const parsed = new Date(error.nextAllowedImportAt);
            if (!isNaN(parsed.getTime())) {
              parsedNextAllowedAt = parsed;
              setNextAllowedZipImportAt(parsed);
            } else {
              setNextAllowedZipImportAt(null);
            }
          }
          const distanceLocale = getDateFnsLocale(i18n.language);
          setZipImportError(
            parsedNextAllowedAt
              ? t('trakt.zipImportCard.subtitleRateLimited', {
                  defaultValue: 'Import cooldown active. You can start another import {{time}}.',
                  time: formatDistanceToNow(parsedNextAllowedAt, {
                    addSuffix: true,
                    locale: distanceLocale,
                  }),
                })
              : t('trakt.zipImport.rateLimitedDescription', {
                  defaultValue: 'Please wait before starting another import.',
                })
          );
        } else if (error instanceof TraktZipUploadError) {
          setZipImportError('Upload failed: Network error while uploading archive.');
        } else {
          setZipImportError(
            error instanceof Error ? error.message : 'Import failed.'
          );
        }
        throw error;
      }
    },
    [ensureEligibleUser, i18n.language, isSyncing, isZipImporting, subscribeToZipProgress, t]
  );

  const dismissZipImport = useCallback(() => {
    isZipImportingRef.current = false;
    if (activeZipImportSubscriptionRef.current) {
      activeZipImportSubscriptionRef.current();
      activeZipImportSubscriptionRef.current = null;
    }
    // Remember which import was acknowledged so later user-doc snapshots
    // for the same (still-persisted server-side) terminal status can't
    // resurrect the summary with null stats.
    const dismissedId =
      activeZipImportIdRef.current ??
      zipImportDocIdRef.current ??
      lastSeenZipImportIdRef.current;
    if (dismissedId) {
      dismissedZipImportIdRef.current = dismissedId;
      setDismissedZipImportId(dismissedId);
      void persistDismissedZipImportId(dismissedId);
    }
    activeZipImportIdRef.current = null;
    pendingTerminalSnapshotRef.current = null;
    clearZipHoldTimeout();
    setZipImportUiState('idle');
    setSelectedZipFile(null);
    setZipUploadProgress(0);
    setZipImportDoc(null);
    setZipImportError(null);
  }, [clearZipHoldTimeout]);

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
