/**
 * Hook for observing real-time TMDB enrichment and zip import status on the Firestore user document
 */

import { TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import { db } from '@/src/firebase/config';
import type { TraktZipImportUIState } from '@/src/types/trakt';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import type React from 'react';
import { useEffect, useRef } from 'react';
import {
  hasEligibleTraktUser,
  isActiveEnrichmentStatus,
  persistDismissedZipImportId,
} from './helpers';

export interface UseTraktUserDocObserverOptions {
  user: User | null;
  invalidateUserLibraryQueries: () => Promise<void>;
  subscribeToZipProgress: (userId: string, importId: string) => void;
  processTerminalZipSnapshot: (params: {
    userId: string;
    importId: string | null;
    status: 'completed' | 'failed';
    error?: string;
  }) => void;
  clearZipHoldTimeout: () => void;
  resetZipImportState: () => void;
  setNextAllowedZipImportAt: (date: Date | null) => void;
  setZipImportUiState: (state: TraktZipImportUIState) => void;
  setDismissedZipImportId: (id: string | null) => void;
  lastSeenZipImportIdRef: React.MutableRefObject<string | null>;
  dismissedZipImportIdRef: React.MutableRefObject<string | null>;
  setIsEnriching: (isEnriching: boolean) => void;
  setLastEnrichedAt: (date: Date | null) => void;
  pendingTerminalSnapshotRef: React.MutableRefObject<{
    error?: string;
    importId: string | null;
    status: 'completed' | 'failed';
    userId: string;
  } | null>;
}

export function useTraktUserDocObserver({
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
}: UseTraktUserDocObserverOptions) {
  const prevEnrichmentStatusRef = useRef<string | undefined>(undefined);

  // Real-time observer for background TMDB enrichment and zip import status on the user document
  useEffect(() => {
    if (!hasEligibleTraktUser(user)) {
      resetZipImportState();
      pendingTerminalSnapshotRef.current = null;
      setIsEnriching(false);
      prevEnrichmentStatusRef.current = undefined;
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
      prevEnrichmentStatusRef.current = undefined;
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
}
