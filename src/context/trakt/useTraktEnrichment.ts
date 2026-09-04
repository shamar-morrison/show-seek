/**
 * Hook for managing Trakt TMDB enrichment state, polling, and triggers
 */

import { TRAKT_CONFIG, TRAKT_STORAGE_KEYS } from '@/src/config/trakt';
import * as TraktService from '@/src/services/TraktService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from 'firebase/auth';
import { useCallback, useEffect, useRef, useState } from 'react';
import { hasEligibleTraktUser, isActiveEnrichmentStatus } from './helpers';

export interface UseTraktEnrichmentOptions {
  user: User | null;
  ensureEligibleUser: (errorMessage: string) => User;
}

export function useTraktEnrichment({ user, ensureEligibleUser }: UseTraktEnrichmentOptions) {
  const [isEnriching, setIsEnriching] = useState(false);
  const [lastEnrichedAt, setLastEnrichedAt] = useState<Date | null>(null);
  const enrichmentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearEnrichmentInterval = useCallback(() => {
    if (enrichmentIntervalRef.current) {
      clearInterval(enrichmentIntervalRef.current);
      enrichmentIntervalRef.current = null;
    }
  }, []);

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

  const handleSyncCompleted = useCallback(async () => {
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
  }, [pollEnrichmentStatus]);

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

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (enrichmentIntervalRef.current) {
        clearInterval(enrichmentIntervalRef.current);
        enrichmentIntervalRef.current = null;
      }
    };
  }, []);

  return {
    isEnriching,
    lastEnrichedAt,
    setIsEnriching,
    setLastEnrichedAt,
    enrichData,
    pollEnrichmentStatus,
    handleSyncCompleted,
    clearEnrichmentInterval,
    enrichmentIntervalRef,
  };
}
