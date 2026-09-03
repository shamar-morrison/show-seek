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
import { LIST_MEMBERSHIP_INDEX_QUERY_KEY } from '@/src/constants/queryKeys';
import { auth, db } from '@/src/firebase/config';
import { TraktRequestError } from '@/src/services/TraktService';
import * as TraktService from '@/src/services/TraktService';
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
import { useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { enUS, es, fr, pt, ptBR, tr } from 'date-fns/locale';
import * as WebBrowser from 'expo-web-browser';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const isActiveSyncStatus = (status?: SyncStatus['status']): boolean =>
  status === 'queued' || status === 'in_progress' || status === 'retrying';

const isActiveEnrichmentStatus = (
  status?: 'idle' | 'queued' | 'in_progress' | 'retrying' | 'completed' | 'failed'
): boolean => status === 'queued' || status === 'in_progress' || status === 'retrying';

const isLockedAccountStatus = (status?: SyncStatus | null): boolean =>
  status?.status === 'failed' && status.errorCategory === 'locked_account';

const hasEligibleTraktUser = (user: User | null): user is User => Boolean(user && !user.isAnonymous);

const ZIP_COOLDOWN_TICK_INTERVAL_MS = 15000;

const getDateFnsLocale = (lang?: string) => {
  switch (lang) {
    case 'es-ES':
    case 'es-MX':
      return es;
    case 'fr':
    case 'fr-FR':
      return fr;
    case 'pt-BR':
      return ptBR;
    case 'pt-PT':
      return pt;
    case 'tr-TR':
      return tr;
    default:
      return enUS;
  }
};

export const [TraktProvider, useTrakt] = createContextHook<TraktContextValue>(() => {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastEnrichedAt, setLastEnrichedAt] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<User | null>(auth.currentUser);

  // Zip Import state
  const [zipImportUiState, setZipImportUiState] = useState<TraktZipImportUIState>('idle');
  const [selectedZipFile, setSelectedZipFile] = useState<SelectedZipFile | null>(null);
  const [zipUploadProgress, setZipUploadProgress] = useState(0);
  const [zipImportDoc, setZipImportDoc] = useState<TraktZipImportProgressDoc | null>(null);
  const [zipImportError, setZipImportError] = useState<string | null>(null);
  const [nextAllowedZipImportAt, setNextAllowedZipImportAt] = useState<Date | null>(null);
  const [zipCooldownTick, setZipCooldownTick] = useState(0);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const enrichmentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasAttemptedAutoSync = useRef(false);
  const prevEnrichmentStatusRef = useRef<string | undefined>(undefined);
  const activeZipImportSubscriptionRef = useRef<(() => void) | null>(null);
  const activeZipImportIdRef = useRef<string | null>(null);

  const isZipImporting = zipImportUiState === 'uploading' || zipImportUiState === 'processing';
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

  const invalidateUserLibraryQueries = useCallback(async () => {
    if (!user?.uid) {
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['lists', user.uid] }),
      queryClient.invalidateQueries({
        queryKey: [LIST_MEMBERSHIP_INDEX_QUERY_KEY, user.uid],
      }),
      queryClient.invalidateQueries({ queryKey: ['ratings', user.uid] }),
      queryClient.invalidateQueries({ queryKey: ['watchedMovies', user.uid] }),
      queryClient.invalidateQueries({ queryKey: ['episodeTracking'] }),
    ]);
  }, [queryClient, user?.uid]);

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
          const zipImportId = zipStatus.id || (zipStatus as any).activeImportId;
          const isZipActive = zipStatus.status === 'pending' || zipStatus.status === 'processing';
          if (isZipActive) {
            setZipImportUiState('processing');
            if (zipImportId) {
              subscribeToZipProgress(user.uid, zipImportId);
            }
          } else if (zipStatus.status === 'completed') {
            setZipImportUiState('completed');
            void invalidateUserLibraryQueries();
          } else if (zipStatus.status === 'failed') {
            setZipImportUiState('failed');
            setZipImportError(zipStatus.error || 'Import failed.');
          }

          const zipNextAllowedAt = zipStatus.nextAllowedImportAt;
          setNextAllowedZipImportAt(
            zipNextAllowedAt && typeof zipNextAllowedAt.toDate === 'function'
              ? zipNextAllowedAt.toDate()
              : null
          );
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
      setZipImportUiState('idle');
      setSelectedZipFile(null);
      setZipUploadProgress(0);
      setZipImportDoc(null);
      setZipImportError(null);
      setNextAllowedZipImportAt(null);
    };
  }, [user, invalidateUserLibraryQueries, subscribeToZipProgress]);

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

  const ensureEligibleUser = useCallback(
    (errorMessage: string): User => {
      if (!hasEligibleTraktUser(user)) {
        throw new Error(errorMessage);
      }

      return user;
    },
    [user]
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
  }, [user]);

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

      return status;
    } catch (error) {
      console.error('[Trakt] Failed to poll sync status:', error);
    }
  }, [user, lastSyncedAt]);

  const pollEnrichmentStatus = useCallback(async () => {
    if (!hasEligibleTraktUser(user)) return;

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
    if (!hasEligibleTraktUser(user) || !syncStatus?.status) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (enrichmentIntervalRef.current) {
        clearInterval(enrichmentIntervalRef.current);
        enrichmentIntervalRef.current = null;
      }
      setIsSyncing(false);
      setIsEnriching(false);
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

    if (isSyncing) {
      console.log('[Trakt] Sync already in progress');
      return;
    }

    if (isZipImporting) {
      console.log('[Trakt] Zip import already in progress');
      throw new Error('A Trakt zip import is currently in progress.');
    }

    try {
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
  }, [ensureEligibleUser, isSyncing, isZipImporting, pollSyncStatus]);

  const startZipImport = useCallback(
    async (file: SelectedZipFile) => {
      const eligibleUser = ensureEligibleUser('Must be logged in to import Trakt archive');

      if (isSyncing) {
        throw new Error('A Trakt sync is already in progress.');
      }

      if (isZipImporting) {
        throw new Error('A Trakt zip import is already in progress.');
      }

      setSelectedZipFile(file);
      setZipImportUiState('uploading');
      setZipUploadProgress(0);
      setZipImportError(null);

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
        console.error('[TraktContext] Zip import error:', error);
        setZipImportUiState('failed');

        if (error instanceof TraktZipRateLimitedError) {
          if (error.nextAllowedImportAt) {
            setNextAllowedZipImportAt(new Date(error.nextAllowedImportAt));
          }
          const distanceLocale = getDateFnsLocale(i18n.language);
          setZipImportError(
            error.nextAllowedImportAt
              ? t('trakt.zipImportCard.subtitleRateLimited', {
                  defaultValue: 'Import cooldown active. You can start another import {{time}}.',
                  time: formatDistanceToNow(new Date(error.nextAllowedImportAt), {
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
    if (activeZipImportSubscriptionRef.current) {
      activeZipImportSubscriptionRef.current();
      activeZipImportSubscriptionRef.current = null;
    }
    activeZipImportIdRef.current = null;
    setZipImportUiState('idle');
    setSelectedZipFile(null);
    setZipUploadProgress(0);
    setZipImportDoc(null);
    setZipImportError(null);
  }, []);

  const disconnectTrakt = useCallback(async () => {
    ensureEligibleUser('Must be logged in to disconnect');

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
  }, [ensureEligibleUser]);

  const enrichData = useCallback(async () => {
    ensureEligibleUser('Must be logged in to enrich data');

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
  }, [ensureEligibleUser, isEnriching, pollEnrichmentStatus]);

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
