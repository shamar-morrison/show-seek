import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { normalizeEpisodeTrackingDoc } from '@/src/services/episodeTrackingNormalization';
import { hasEpisodeAired } from '@/src/utils/dateUtils';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import { collection, deleteDoc, deleteField, doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import type { Episode, Season } from '../api/tmdb';
import { auth, db } from '../firebase/config';
import type {
  EpisodeTrackingMetadata,
  SeasonProgress,
  ShowProgress,
  TVShowEpisodeTracking,
  WatchedEpisode,
} from '../types/episodeTracking';

/** Maximum writes per Firestore WriteBatch commit. */
const MAX_HIDDEN_BATCH_WRITES = 500;

class EpisodeTrackingService {
  /**
   * Get reference to a TV show's episode tracking document
   */
  private getShowTrackingRef(userId: string, tvShowId: number) {
    return doc(db, 'users', userId, 'episode_tracking', tvShowId.toString());
  }

  /**
   * Generate composite key for episode
   */
  private getEpisodeKey(seasonNumber: number, episodeNumber: number): string {
    return `${seasonNumber}_${episodeNumber}`;
  }

  async getShowTracking(tvShowId: number): Promise<TVShowEpisodeTracking | null> {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) return null;

    const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
    const timeout = createTimeoutWithCleanup(10000);

    try {
      const snapshot = await Promise.race([
        auditedGetDoc(trackingRef, {
          path: `users/${user.uid}/episode_tracking/${tvShowId}`,
          queryKey: 'episodeTrackingByShow',
          callsite: 'EpisodeTrackingService.getShowTracking',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      if (!snapshot.exists()) {
        return null;
      }

      return normalizeEpisodeTrackingDoc(snapshot.data(), snapshot.id);
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Mark an episode as watched
   */
  async markEpisodeWatched(
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number,
    episodeData: {
      episodeId: number;
      episodeName: string;
      episodeAirDate: string | null;
      runtimeMinutes?: number;
    },
    showMetadata: {
      tvShowName: string;
      posterPath: string | null;
    }
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const episodeKey = this.getEpisodeKey(seasonNumber, episodeNumber);

      const watchedEpisode: WatchedEpisode = {
        episodeId: episodeData.episodeId,
        tvShowId,
        seasonNumber,
        episodeNumber,
        watchedAt: Date.now(),
        episodeName: episodeData.episodeName,
        episodeAirDate: episodeData.episodeAirDate,
        ...(episodeData.runtimeMinutes !== undefined && episodeData.runtimeMinutes > 0
          ? { runtimeMinutes: episodeData.runtimeMinutes }
          : {}),
      };

      const metadata: EpisodeTrackingMetadata = {
        tvShowName: showMetadata.tvShowName,
        posterPath: showMetadata.posterPath,
        lastUpdated: Date.now(),
      };

      const timeout = createTimeoutWithCleanup(10000);
      await Promise.race([
        setDoc(
          trackingRef,
          {
            episodes: {
              [episodeKey]: watchedEpisode,
            },
            metadata,
          },
          { merge: true }
        ),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Mark an episode as unwatched (remove from tracking)
   */
  async markEpisodeUnwatched(
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const episodeKey = this.getEpisodeKey(seasonNumber, episodeNumber);

      const timeout = createTimeoutWithCleanup(10000);

      // First check if the document exists to avoid "not-found" errors
      const snapshot = await Promise.race([
        auditedGetDoc(trackingRef, {
          path: `users/${user.uid}/episode_tracking/${tvShowId}`,
          queryKey: 'episodeTrackingByShow',
          callsite: 'EpisodeTrackingService.markEpisodeUnwatched',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });
      if (!snapshot.exists()) {
        // No tracking data exists, nothing to unwatch - return early as no-op
        return;
      }

      const updateTimeout = createTimeoutWithCleanup(10000);
      await Promise.race([
        updateDoc(trackingRef, {
          [`episodes.${episodeKey}`]: deleteField(),
          'metadata.lastUpdated': Date.now(),
        }),
        updateTimeout.promise,
      ]).finally(() => {
        updateTimeout.cancel();
      });
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Mark all episodes in a season as watched (batch operation)
   */
  async markAllEpisodesWatched(
    tvShowId: number,
    seasonNumber: number,
    episodes: Episode[],
    showMetadata: {
      tvShowName: string;
      posterPath: string | null;
    }
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const now = Date.now();

      // Build the episodes map for batch update
      const episodesMap: Record<string, WatchedEpisode> = {};
      episodes.forEach((episode) => {
        const episodeKey = this.getEpisodeKey(seasonNumber, episode.episode_number);
        episodesMap[episodeKey] = {
          episodeId: episode.id,
          tvShowId,
          seasonNumber,
          episodeNumber: episode.episode_number,
          watchedAt: now,
          episodeName: episode.name,
          episodeAirDate: episode.air_date,
          ...(episode.runtime != null && episode.runtime > 0
            ? { runtimeMinutes: episode.runtime }
            : {}),
        };
      });

      const metadata: EpisodeTrackingMetadata = {
        tvShowName: showMetadata.tvShowName,
        posterPath: showMetadata.posterPath,
        lastUpdated: now,
      };

      const timeout = createTimeoutWithCleanup(10000);

      // Use setDoc with merge to update all episodes at once
      await Promise.race([
        setDoc(
          trackingRef,
          {
            episodes: episodesMap,
            metadata,
          },
          { merge: true }
        ),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Mark multiple episodes across seasons as watched in chunks with delays and cancellation support.
   */
  async markMultipleEpisodesWatched(
    tvShowId: number,
    episodesToMark: Array<{ seasonNumber: number; episode: Episode }>,
    showMetadata: {
      tvShowName: string;
      posterPath: string | null;
    },
    options?: {
      batchSize?: number;
      delayMs?: number;
      isCancelled?: () => boolean;
      onProgress?: (markedCount: number, totalCount: number) => void;
    }
  ): Promise<{ markedCount: number; wasCancelled: boolean }> {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('Please sign in to continue');
    if (episodesToMark.length === 0) return { markedCount: 0, wasCancelled: false };

    const batchSize =
      typeof options?.batchSize === 'number' &&
      Number.isInteger(options.batchSize) &&
      options.batchSize > 0
        ? options.batchSize
        : 10;
    const delayMs =
      typeof options?.delayMs === 'number' &&
      Number.isFinite(options.delayMs) &&
      options.delayMs >= 0
        ? options.delayMs
        : 300;
    const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
    let markedCount = 0;
    let wasCancelled = false;

    for (let i = 0; i < episodesToMark.length; i += batchSize) {
      if (options?.isCancelled?.()) {
        wasCancelled = true;
        break;
      }

      const chunk = episodesToMark.slice(i, i + batchSize);
      const now = Date.now();
      const episodesMap: Record<string, WatchedEpisode> = {};

      chunk.forEach(({ seasonNumber, episode }) => {
        const episodeKey = this.getEpisodeKey(seasonNumber, episode.episode_number);
        episodesMap[episodeKey] = {
          episodeId: episode.id,
          tvShowId,
          seasonNumber,
          episodeNumber: episode.episode_number,
          watchedAt: now,
          episodeName: episode.name,
          episodeAirDate: episode.air_date,
          ...(episode.runtime != null && episode.runtime > 0
            ? { runtimeMinutes: episode.runtime }
            : {}),
        };
      });

      const metadata: EpisodeTrackingMetadata = {
        tvShowName: showMetadata.tvShowName,
        posterPath: showMetadata.posterPath,
        lastUpdated: now,
      };

      const timeout = createTimeoutWithCleanup(10000);
      try {
        await Promise.race([
          setDoc(
            trackingRef,
            {
              episodes: episodesMap,
              metadata,
            },
            { merge: true }
          ),
          timeout.promise,
        ]);
      } catch (error) {
        throw new Error(getFirestoreErrorMessage(error));
      } finally {
        timeout.cancel();
      }

      markedCount += chunk.length;
      options?.onProgress?.(markedCount, episodesToMark.length);

      if (i + batchSize < episodesToMark.length) {
        if (options?.isCancelled?.()) {
          wasCancelled = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { markedCount, wasCancelled };
  }

  /**
   * Mark all episodes in a season as unwatched (single batch operation)
   */
  async markAllEpisodesUnwatched(
    tvShowId: number,
    seasonNumber: number,
    episodes: Episode[]
  ): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');
      if (episodes.length === 0) return;

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const timeout = createTimeoutWithCleanup(10000);

      // Check document existence once to avoid not-found errors on update.
      const snapshot = await Promise.race([
        auditedGetDoc(trackingRef, {
          path: `users/${user.uid}/episode_tracking/${tvShowId}`,
          queryKey: 'episodeTrackingByShow',
          callsite: 'EpisodeTrackingService.markAllEpisodesUnwatched',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      if (!snapshot.exists()) {
        return;
      }

      const updatePayload: Record<string, unknown> = {
        'metadata.lastUpdated': Date.now(),
      };

      episodes.forEach((episode) => {
        const episodeKey = this.getEpisodeKey(seasonNumber, episode.episode_number);
        updatePayload[`episodes.${episodeKey}`] = deleteField();
      });

      const updateTimeout = createTimeoutWithCleanup(10000);
      await Promise.race([updateDoc(trackingRef, updatePayload), updateTimeout.promise]).finally(
        () => {
          updateTimeout.cancel();
        }
      );
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Mark multiple episodes across seasons as unwatched in chunks with delays and cancellation support.
   * Mirrors markMultipleEpisodesWatched: chunks cross season boundaries freely so progress
   * reporting and cancellation stay at episode granularity even for a single very large season.
   */
  async markMultipleEpisodesUnwatched(
    tvShowId: number,
    episodesToUnmark: Array<{ seasonNumber: number; episode: Episode }>,
    options?: {
      batchSize?: number;
      delayMs?: number;
      isCancelled?: () => boolean;
      onProgress?: (unmarkedCount: number, totalCount: number) => void;
    }
  ): Promise<{ unmarkedCount: number; wasCancelled: boolean }> {
    const user = auth.currentUser;
    if (!user || user.isAnonymous) throw new Error('Please sign in to continue');
    if (episodesToUnmark.length === 0) return { unmarkedCount: 0, wasCancelled: false };

    const batchSize =
      typeof options?.batchSize === 'number' &&
      Number.isInteger(options.batchSize) &&
      options.batchSize > 0
        ? options.batchSize
        : 10;
    const delayMs =
      typeof options?.delayMs === 'number' &&
      Number.isFinite(options.delayMs) &&
      options.delayMs >= 0
        ? options.delayMs
        : 300;
    const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);

    // Single existence check up front: updateDoc on a missing document throws not-found.
    const existsTimeout = createTimeoutWithCleanup(10000);
    const snapshot = await Promise.race([
      auditedGetDoc(trackingRef, {
        path: `users/${user.uid}/episode_tracking/${tvShowId}`,
        queryKey: 'episodeTrackingByShow',
        callsite: 'EpisodeTrackingService.markMultipleEpisodesUnwatched',
      }),
      existsTimeout.promise,
    ]).finally(() => {
      existsTimeout.cancel();
    });

    if (!snapshot.exists()) {
      return { unmarkedCount: 0, wasCancelled: false };
    }

    let unmarkedCount = 0;
    let wasCancelled = false;

    for (let i = 0; i < episodesToUnmark.length; i += batchSize) {
      if (options?.isCancelled?.()) {
        wasCancelled = true;
        break;
      }

      const chunk = episodesToUnmark.slice(i, i + batchSize);
      const now = Date.now();
      const updatePayload: Record<string, unknown> = {
        'metadata.lastUpdated': now,
      };

      chunk.forEach(({ seasonNumber, episode }) => {
        const episodeKey = this.getEpisodeKey(seasonNumber, episode.episode_number);
        updatePayload[`episodes.${episodeKey}`] = deleteField();
      });

      const updateTimeout = createTimeoutWithCleanup(10000);
      try {
        await Promise.race([updateDoc(trackingRef, updatePayload), updateTimeout.promise]);
      } catch (error) {
        throw new Error(getFirestoreErrorMessage(error));
      } finally {
        updateTimeout.cancel();
      }

      unmarkedCount += chunk.length;
      options?.onProgress?.(unmarkedCount, episodesToUnmark.length);

      if (i + batchSize < episodesToUnmark.length) {
        if (options?.isCancelled?.()) {
          wasCancelled = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }

    return { unmarkedCount, wasCancelled };
  }

  /**
   * Calculate progress for a specific season.
   * Excludes unaired episodes from the denominator unless `allowUnreleased` is true,
   * in which case the full known episode total is used for both numerator and denominator.
   */
  calculateSeasonProgress(
    seasonNumber: number,
    episodes: Episode[],
    watchedEpisodes: Record<string, WatchedEpisode>,
    allowUnreleased = false
  ): SeasonProgress {
    const totalCount = episodes.length;
    const airedEpisodes = episodes.filter((ep) => hasEpisodeAired(ep.air_date));
    const watchedSeasonEpisodes = episodes.filter((ep) =>
      this.isEpisodeWatched(seasonNumber, ep.episode_number, watchedEpisodes)
    );
    const totalAiredCount = airedEpisodes.length;
    const watchedCount = allowUnreleased
      ? watchedSeasonEpisodes.length
      : watchedSeasonEpisodes.filter((ep) => hasEpisodeAired(ep.air_date)).length;
    const progressTotalCount = allowUnreleased ? totalCount : totalAiredCount;
    const percentage = progressTotalCount > 0 ? (watchedCount / progressTotalCount) * 100 : 0;

    return {
      seasonNumber,
      watchedCount,
      totalCount,
      totalAiredCount,
      progressTotalCount,
      percentage,
    };
  }

  /**
   * Calculate overall progress for a TV show.
   * Excludes Season 0 (specials) and unaired episodes from the denominator unless
   * `allowUnreleased` is true, in which case full known episode totals are used.
   */
  calculateShowProgress(
    seasons: Season[],
    allEpisodes: Episode[],
    watchedEpisodes: Record<string, WatchedEpisode>,
    allowUnreleased = false
  ): ShowProgress {
    const validEpisodes = allEpisodes.filter((ep) => ep.season_number > 0);
    const airedEpisodes = validEpisodes.filter((ep) => hasEpisodeAired(ep.air_date));
    const watchedValidEpisodes = validEpisodes.filter((ep) =>
      this.isEpisodeWatched(ep.season_number, ep.episode_number, watchedEpisodes)
    );
    const totalWatched = allowUnreleased
      ? watchedValidEpisodes.length
      : watchedValidEpisodes.filter((ep) => hasEpisodeAired(ep.air_date)).length;

    const totalEpisodes = validEpisodes.length;
    const totalAiredEpisodes = airedEpisodes.length;
    const progressTotalEpisodes = allowUnreleased ? totalEpisodes : totalAiredEpisodes;
    const percentage = progressTotalEpisodes > 0 ? (totalWatched / progressTotalEpisodes) * 100 : 0;

    // Calculate progress per season
    const seasonProgress = seasons
      .filter((s) => s.season_number > 0)
      .map((season) => {
        const seasonEpisodes = allEpisodes.filter(
          (ep) => ep.season_number === season.season_number
        );
        return this.calculateSeasonProgress(
          season.season_number,
          seasonEpisodes,
          watchedEpisodes,
          allowUnreleased
        );
      });

    return {
      totalWatched,
      totalEpisodes,
      totalAiredEpisodes,
      progressTotalEpisodes,
      percentage,
      seasonProgress,
    };
  }

  /**
   * Get all watched shows for a user
   */
  async getAllWatchedShows(userId: string): Promise<TVShowEpisodeTracking[]> {
    try {
      const trackingCollectionRef = collection(db, 'users', userId, 'episode_tracking');

      const timeout = createTimeoutWithCleanup(10000);
      const snapshot = await Promise.race([
        auditedGetDocs(trackingCollectionRef, {
          path: `users/${userId}/episode_tracking`,
          queryKey: 'episodeTrackingAllShows',
          callsite: 'EpisodeTrackingService.getAllWatchedShows',
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });

      return snapshot.docs
        .map((doc) => normalizeEpisodeTrackingDoc(doc.data(), doc.id))
        .filter((show): show is TVShowEpisodeTracking => show !== null);
    } catch (error) {
      console.error('[EpisodeTrackingService] Error fetching all watched shows:', error);
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Set whether a show is hidden from Watch Progress without modifying watched episodes.
   * Mirrors the web app's setHiddenFromProgress.
   */
  async setHiddenFromProgress(tvShowId: number, hidden: boolean): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const timeout = createTimeoutWithCleanup(10000);
      await Promise.race([
        updateDoc(trackingRef, {
          'metadata.hiddenFromProgress': hidden,
        }),
        timeout.promise,
      ]).finally(() => {
        timeout.cancel();
      });
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Set the hidden state for multiple shows in batched writes.
   * Splits into chunks of at most MAX_HIDDEN_BATCH_WRITES (Firestore WriteBatch limit).
   */
  async setHiddenFromProgressBatch(tvShowIds: number[], hidden: boolean): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');
      if (tvShowIds.length === 0) return;

      for (let i = 0; i < tvShowIds.length; i += MAX_HIDDEN_BATCH_WRITES) {
        const batch = writeBatch(db);
        tvShowIds.slice(i, i + MAX_HIDDEN_BATCH_WRITES).forEach((tvShowId) => {
          batch.update(this.getShowTrackingRef(user.uid, tvShowId), {
            'metadata.hiddenFromProgress': hidden,
          });
        });

        const timeout = createTimeoutWithCleanup(10000);
        await Promise.race([batch.commit(), timeout.promise]).finally(() => {
          timeout.cancel();
        });
      }
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Delete an entire show's episode tracking document.
   * Used when removing a show from watch tracking (e.g. unresolvable/orphaned shows).
   */
  async deleteShowTracking(tvShowId: number): Promise<void> {
    try {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) throw new Error('Please sign in to continue');

      const trackingRef = this.getShowTrackingRef(user.uid, tvShowId);
      const timeout = createTimeoutWithCleanup(10000);
      await Promise.race([deleteDoc(trackingRef), timeout.promise]).finally(() => {
        timeout.cancel();
      });
    } catch (error) {
      throw new Error(getFirestoreErrorMessage(error));
    }
  }

  /**
   * Check if a specific episode is watched
   */
  isEpisodeWatched(
    seasonNumber: number,
    episodeNumber: number,
    watchedEpisodes: Record<string, WatchedEpisode>
  ): boolean {
    const episodeKey = this.getEpisodeKey(seasonNumber, episodeNumber);
    return episodeKey in watchedEpisodes;
  }
}

// Export singleton instance
export const episodeTrackingService = new EpisodeTrackingService();
