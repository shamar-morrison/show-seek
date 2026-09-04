/**
 * Hook for managing Trakt zip archive import, upload progress, hold timeouts, and dismissal
 */

import {
  generateImportId,
  SelectedZipFile,
  traktZipImportService,
  TraktZipImportProgressDoc,
  TraktZipRateLimitedError,
  TraktZipUploadError,
} from '@/src/services/TraktZipImportService';
import type { TraktZipImportUIState } from '@/src/types/trakt';
import { formatDistanceToNow } from 'date-fns';
import type { User } from 'firebase/auth';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ZIP_COOLDOWN_TICK_INTERVAL_MS,
  ZIP_HOLD_FOR_DOC_TIMEOUT_MS,
} from './constants';
import { getDateFnsLocale, persistDismissedZipImportId } from './helpers';

export interface UseTraktZipImportOptions {
  user: User | null;
  ensureEligibleUser: (errorMessage: string) => User;
  isSyncingRef: React.RefObject<boolean>;
  isZipImportingRef: React.MutableRefObject<boolean>;
  dismissalHydratedRef: React.RefObject<boolean>;
  pendingTerminalSnapshotRef: React.MutableRefObject<{
    error?: string;
    importId: string | null;
    status: 'completed' | 'failed';
    userId: string;
  } | null>;
  invalidateUserLibraryQueries: () => Promise<void>;
}

export function useTraktZipImport({
  ensureEligibleUser,
  isSyncingRef,
  isZipImportingRef,
  dismissalHydratedRef,
  pendingTerminalSnapshotRef,
  invalidateUserLibraryQueries,
}: UseTraktZipImportOptions) {
  const { t, i18n } = useTranslation();

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

  const activeZipImportSubscriptionRef = useRef<(() => void) | null>(null);
  const activeZipImportIdRef = useRef<string | null>(null);
  const dismissedZipImportIdRef = useRef<string | null>(null);
  const lastSeenZipImportIdRef = useRef<string | null>(null);
  const zipImportDocIdRef = useRef<string | null>(null);
  const zipImportDocRef = useRef<TraktZipImportProgressDoc | null>(null);

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
  }, [isZipImporting, isZipImportingRef]);

  const isZipImportRateLimited =
    nextAllowedZipImportAt !== null && nextAllowedZipImportAt.getTime() > Date.now();

  useEffect(() => {
    if (!nextAllowedZipImportAt || nextAllowedZipImportAt.getTime() <= Date.now()) {
      return;
    }

    const interval = setInterval(() => {
      setZipCooldownTick((tick) => tick + 1);
      if (nextAllowedZipImportAt.getTime() <= Date.now()) {
        clearInterval(interval);
      }
    }, ZIP_COOLDOWN_TICK_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [nextAllowedZipImportAt]);

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
    [
      clearZipHoldTimeout,
      dismissalHydratedRef,
      invalidateUserLibraryQueries,
      pendingTerminalSnapshotRef,
      subscribeToZipProgress,
    ]
  );

  const startZipImport = useCallback(
    async (file: SelectedZipFile) => {
      const eligibleUser = ensureEligibleUser('Must be logged in to import Trakt archive');

      if (isSyncingRef.current) {
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
    [
      ensureEligibleUser,
      i18n.language,
      isSyncingRef,
      isZipImporting,
      isZipImportingRef,
      subscribeToZipProgress,
      t,
    ]
  );

  const dismissZipImport = useCallback(() => {
    if (isZipImportingRef) {
      isZipImportingRef.current = false;
    }
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
    clearZipHoldTimeout();
    setZipImportUiState('idle');
    setSelectedZipFile(null);
    setZipUploadProgress(0);
    setZipImportDoc(null);
    setZipImportError(null);
  }, [clearZipHoldTimeout, isZipImportingRef]);

  const resetZipImportState = useCallback(() => {
    if (activeZipImportSubscriptionRef.current) {
      activeZipImportSubscriptionRef.current();
      activeZipImportSubscriptionRef.current = null;
    }
    activeZipImportIdRef.current = null;
    clearZipHoldTimeout();
    setZipImportUiState('idle');
    setSelectedZipFile(null);
    setZipUploadProgress(0);
    setZipImportDoc(null);
    setZipImportError(null);
    setNextAllowedZipImportAt(null);
    if (isZipImportingRef) {
      isZipImportingRef.current = false;
    }
  }, [clearZipHoldTimeout, isZipImportingRef]);

  // Cleanup polling interval and subscription on unmount
  useEffect(() => {
    return () => {
      if (activeZipImportSubscriptionRef.current) {
        activeZipImportSubscriptionRef.current();
        activeZipImportSubscriptionRef.current = null;
      }
      clearZipHoldTimeout();
    };
  }, [clearZipHoldTimeout]);

  return {
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
    activeZipImportSubscriptionRef,
    activeZipImportIdRef,
    setSelectedZipFile,
    setZipImportUiState,
    setZipUploadProgress,
    setZipImportDoc,
    setZipImportError,
    setNextAllowedZipImportAt,
    setDismissedZipImportId,
    startZipImport,
    dismissZipImport,
    clearZipHoldTimeout,
    subscribeToZipProgress,
    processTerminalZipSnapshot,
    resetZipImportState,
  };
}
