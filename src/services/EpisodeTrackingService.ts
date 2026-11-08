import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { auditedGetDoc, auditedGetDocs } from '@/src/services/firestoreReadAudit';
import { normalizeEpisodeTrackingDoc } from '@/src/services/episodeTrackingNormalization';
import { hasEpisodeAired } from '@/src/utils/dateUtils';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import { EPISODE_PAGES_COLLECTION } from '@/functions/src/shared/episodePages';
import {
  createSinglePageLayout,
  getPageCount,
  getPageDocId,
  mergePages,
  PAGE_CAPACITY,
  parsePageDocId,
  planPagedMapWrites,
  recordRemoval,
  type PageLayout,
  type PagedMapWritePlan,
} from '@/functions/src/shared/pagedMap';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
} from 'firebase/firestore';
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

/** Firestore's error when a write would push a document past 1 MiB. */
const DOCUMENT_TOO_LARGE_PATTERN = /exceeds the maximum allowed size/i;

type EpisodeWritePlan = PagedMapWritePlan<WatchedEpisode, unknown>;

/** Where a show's episodes live (very long shows spill into `episode_pages`), plus their keys. */
interface KnownEpisodeLayout {
  layout: PageLayout;
  keys: Set<string>;
}

class EpisodeTrackingService {
  /** Page layouts from the last read or write, keyed `${userId}/${tvShowId}`. */
  private readonly knownLayouts = new Map<string, KnownEpisodeLayout>();

  private layoutKey(userId: string, tvShowId: number | string) {
    return `${userId}/${tvShowId}`;
  }

  /** Forgets every remembered layout (tests; also safe to call on sign-out). */
  clearEpisodeLayouts() {
    this.knownLayouts.clear();
  }

  private getEpisodePagesCollection(userId: string, tvShowId: number | string) {
    return collection(
      db,
      'users',
      userId,
      'episode_tracking',
      String(tvShowId),
      EPISODE_PAGES_COLLECTION
    );
  }

  private getEpisodePageRef(userId: string, tvShowId: number, page: number) {
    return doc(
      db,
      'users',
      userId,
      'episode_tracking',
      tvShowId.toString(),
      EPISODE_PAGES_COLLECTION,
      getPageDocId(page)
    );
  }

  /**
   * Merges a tracking document that was already read with its overflow pages, and says which
   * page holds each episode (episodes not listed are in the document). Free for shows without
   * pages. Used by History, which reads every show's document itself.
   */
  async mergeOverflowPages(
    userId: string,
    tvShowId: number | string,
    data: DocumentData,
    callsite: string
  ): Promise<{ data: DocumentData; overflowItemPages: Record<string, number> }> {
    const merged = await this.withEpisodePages(userId, tvShowId, data, callsite);
    return {
      data: merged,
      overflowItemPages: {
        ...(this.knownLayouts.get(this.layoutKey(userId, tvShowId))?.layout.overflowItemPages ?? {}),
      },
    };
  }

  /**
   * Merges a tracking document's overflow pages (if any) into its `episodes` and remembers
   * where each episode lives. Shows without pages cost no extra reads.
   */
  private async withEpisodePages(
    userId: string,
    tvShowId: number | string,
    data: DocumentData,
    callsite: string
  ): Promise<DocumentData> {
    const mainEpisodes = (data.episodes ?? {}) as Record<string, WatchedEpisode>;
    const pageCount = getPageCount(data);
    let merged = {
      items: mainEpisodes,
      layout: createSinglePageLayout(Object.keys(mainEpisodes).length),
    };

    if (pageCount > 0) {
      const pages = await auditedGetDocs(this.getEpisodePagesCollection(userId, tvShowId), {
        path: `users/${userId}/episode_tracking/${tvShowId}/${EPISODE_PAGES_COLLECTION}`,
        queryKey: 'episodeTrackingPages',
        callsite,
      });
      merged = mergePages(
        mainEpisodes,
        pageCount,
        pages.docs
          .map((pageDoc) => ({
            items: (pageDoc.data().episodes ?? {}) as Record<string, WatchedEpisode>,
            page: parsePageDocId(pageDoc.id) ?? -1,
          }))
          .filter((source) => source.page >= 1)
      );
    }

    this.knownLayouts.set(this.layoutKey(userId, tvShowId), {
      keys: new Set(Object.keys(merged.items)),
      layout: merged.layout,
    });
    return { ...data, episodes: merged.items };
  }

  /** The show's layout: remembered, or read from Firestore (document + pages). */
  private async resolveLayout(userId: string, tvShowId: number): Promise<KnownEpisodeLayout> {
    const known = this.knownLayouts.get(this.layoutKey(userId, tvShowId));
    if (known) {
      return known;
    }

    const trackingRef = this.getShowTrackingRef(userId, tvShowId);
    const snapshot = await auditedGetDoc(trackingRef, {
      path: `users/${userId}/episode_tracking/${tvShowId}`,
      queryKey: 'episodeTrackingByShow',
      callsite: 'EpisodeTrackingService.resolveLayout',
    });
    if (!snapshot.exists()) {
      const empty = { keys: new Set<string>(), layout: createSinglePageLayout(0) };
      this.knownLayouts.set(this.layoutKey(userId, tvShowId), empty);
      return empty;
    }
    await this.withEpisodePages(
      userId,
      tvShowId,
      snapshot.data(),
      'EpisodeTrackingService.resolveLayout'
    );
    return this.knownLayouts.get(this.layoutKey(userId, tvShowId))!;
  }

  /**
   * Writes watched episodes. Shows that fit in their document are written exactly as before
   * (one merge, no read); very long shows spill new episodes into overflow pages.
   */
  private async writeWatchedEpisodes(
    userId: string,
    tvShowId: number,
    episodes: Record<string, WatchedEpisode>,
    metadata: EpisodeTrackingMetadata
  ): Promise<void> {
    const trackingRef = this.getShowTrackingRef(userId, tvShowId);
    const known = this.knownLayouts.get(this.layoutKey(userId, tvShowId));
    let plan: EpisodeWritePlan | null = known
      ? planPagedMapWrites(known.layout, known.keys, { set: episodes }, deleteField() as unknown)
      : null;

    if (!plan || plan.pageCount === 0) {
      const timeout = createTimeoutWithCleanup(10000);
      try {
        await Promise.race([
          setDoc(trackingRef, { episodes, metadata }, { merge: true }),
          timeout.promise,
        ]);
        this.recordWritten(userId, tvShowId, episodes, plan);
        return;
      } catch (error) {
        const message = (error as { message?: unknown } | null)?.message;
        if (typeof message !== 'string' || !DOCUMENT_TOO_LARGE_PATTERN.test(message)) {
          throw error;
        }
        // The show's document is full: spill into overflow pages instead.
        this.knownLayouts.delete(this.layoutKey(userId, tvShowId));
      } finally {
        timeout.cancel();
      }

      const resolved = await this.resolveLayout(userId, tvShowId);
      resolved.layout.pageSizes[0] = Math.max(resolved.layout.pageSizes[0] ?? 0, PAGE_CAPACITY);
      plan = planPagedMapWrites(
        resolved.layout,
        resolved.keys,
        { set: episodes },
        deleteField() as unknown
      );
    }

    await this.writePlannedEpisodes(userId, tvShowId, plan, metadata);
    this.recordWritten(userId, tvShowId, episodes, plan);
  }

  /**
   * Writes a plan across pages. New pages are registered first by raising `pageCount` in a
   * transaction (it never goes down); if a later write fails, `pageCount` points at an empty
   * page, which reads as nothing.
   */
  private async writePlannedEpisodes(
    userId: string,
    tvShowId: number,
    plan: EpisodeWritePlan,
    metadata: EpisodeTrackingMetadata
  ): Promise<void> {
    const trackingRef = this.getShowTrackingRef(userId, tvShowId);
    const now = Date.now();
    const knownPageCount =
      this.knownLayouts.get(this.layoutKey(userId, tvShowId))?.layout.pageCount ?? 0;
    const timeout = createTimeoutWithCleanup(10000);

    try {
      if (plan.createsPages) {
        await Promise.race([
          runTransaction(db, async (transaction) => {
            const snapshot = await transaction.get(trackingRef);
            const current = getPageCount(snapshot.data());
            if (snapshot.exists() && current < plan.pageCount) {
              transaction.update(trackingRef, { pageCount: plan.pageCount });
            }
          }),
          timeout.promise,
        ]);
      }

      const batch = writeBatch(db);
      const mainEpisodes = plan.pageItems.get(0);
      batch.set(
        trackingRef,
        { ...(mainEpisodes ? { episodes: mainEpisodes } : {}), metadata },
        { merge: true }
      );
      plan.pageItems.forEach((episodes, page) => {
        if (page === 0) {
          return;
        }
        batch.set(
          this.getEpisodePageRef(userId, tvShowId, page),
          {
            episodes,
            updatedAt: now,
            ...(page > knownPageCount ? { createdAt: now } : {}),
          },
          { merge: true }
        );
      });
      await Promise.race([batch.commit(), timeout.promise]);
    } finally {
      timeout.cancel();
    }
  }

  private recordWritten(
    userId: string,
    tvShowId: number,
    episodes: Record<string, WatchedEpisode>,
    plan: EpisodeWritePlan | null
  ) {
    const key = this.layoutKey(userId, tvShowId);
    const known = this.knownLayouts.get(key);
    if (!known) {
      return;
    }
    if (plan) {
      known.layout = plan.layout;
    }
    Object.keys(episodes).forEach((episodeKey) => known.keys.add(episodeKey));
  }

  /**
   * Removes episodes from the show's document and, for very long shows, every overflow page.
   * `pageCount` comes from the document the caller just read.
   */
  private async deleteWatchedEpisodes(
    userId: string,
    tvShowId: number,
    episodeKeys: string[],
    pageCount: number
  ): Promise<void> {
    const trackingRef = this.getShowTrackingRef(userId, tvShowId);
    const now = Date.now();
    const updatePayload: Record<string, unknown> = { 'metadata.lastUpdated': now };
    episodeKeys.forEach((episodeKey) => {
      updatePayload[`episodes.${episodeKey}`] = deleteField();
    });

    const timeout = createTimeoutWithCleanup(10000);
    try {
      if (pageCount === 0) {
        await Promise.race([updateDoc(trackingRef, updatePayload), timeout.promise]);
      } else {
        const batch = writeBatch(db);
        batch.update(trackingRef, updatePayload);
        for (let page = 1; page <= pageCount; page += 1) {
          batch.set(
            this.getEpisodePageRef(userId, tvShowId, page),
            {
              episodes: Object.fromEntries(episodeKeys.map((key) => [key, deleteField()])),
              updatedAt: now,
            },
            { merge: true }
          );
        }
        await Promise.race([batch.commit(), timeout.promise]);
      }
    } finally {
      timeout.cancel();
    }

    const known = this.knownLayouts.get(this.layoutKey(userId, tvShowId));
    if (known) {
      recordRemoval(known.layout, (key) => known.keys.has(key), episodeKeys);
      episodeKeys.forEach((key) => known.keys.delete(key));
    }
  }

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

      return normalizeEpisodeTrackingDoc(
        await this.withEpisodePages(
          user.uid,
          tvShowId,
          snapshot.data(),
          'EpisodeTrackingService.getShowTracking'
        ),
        snapshot.id
      );
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

      await this.writeWatchedEpisodes(
        user.uid,
        tvShowId,
        { [episodeKey]: watchedEpisode },
        metadata
      );
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

      await this.deleteWatchedEpisodes(
        user.uid,
        tvShowId,
        [episodeKey],
        getPageCount(snapshot.data())
      );
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

      // One merge for the whole season (spread over pages only for very long shows).
      await this.writeWatchedEpisodes(user.uid, tvShowId, episodesMap, metadata);
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

      try {
        await this.writeWatchedEpisodes(user.uid, tvShowId, episodesMap, metadata);
      } catch (error) {
        throw new Error(getFirestoreErrorMessage(error));
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

      await this.deleteWatchedEpisodes(
        user.uid,
        tvShowId,
        episodes.map((episode) => this.getEpisodeKey(seasonNumber, episode.episode_number)),
        getPageCount(snapshot.data())
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
    const pageCount = getPageCount(snapshot.data());

    let unmarkedCount = 0;
    let wasCancelled = false;

    for (let i = 0; i < episodesToUnmark.length; i += batchSize) {
      if (options?.isCancelled?.()) {
        wasCancelled = true;
        break;
      }

      const chunk = episodesToUnmark.slice(i, i + batchSize);
      try {
        await this.deleteWatchedEpisodes(
          user.uid,
          tvShowId,
          chunk.map(({ seasonNumber, episode }) =>
            this.getEpisodeKey(seasonNumber, episode.episode_number)
          ),
          pageCount
        );
      } catch (error) {
        throw new Error(getFirestoreErrorMessage(error));
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

      // Very long shows keep episodes in overflow pages; only those shows cost an extra read.
      const shows = await Promise.all(
        snapshot.docs.map(async (trackingDoc) =>
          normalizeEpisodeTrackingDoc(
            await this.withEpisodePages(
              userId,
              trackingDoc.id,
              trackingDoc.data(),
              'EpisodeTrackingService.getAllWatchedShows'
            ),
            trackingDoc.id
          )
        )
      );
      return shows.filter((show): show is TVShowEpisodeTracking => show !== null);
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
      const known = this.knownLayouts.get(this.layoutKey(user.uid, tvShowId));
      const timeout = createTimeoutWithCleanup(10000);
      try {
        if (known && known.layout.pageCount === 0) {
          await Promise.race([deleteDoc(trackingRef), timeout.promise]);
        } else {
          // Delete overflow pages with the show, so re-tracking it later starts clean.
          const pages = await Promise.race([
            auditedGetDocs(this.getEpisodePagesCollection(user.uid, tvShowId), {
              path: `users/${user.uid}/episode_tracking/${tvShowId}/${EPISODE_PAGES_COLLECTION}`,
              queryKey: 'episodeTrackingPages',
              callsite: 'EpisodeTrackingService.deleteShowTracking',
            }),
            timeout.promise,
          ]);
          const batch = writeBatch(db);
          pages.docs.forEach((pageDoc) => batch.delete(pageDoc.ref));
          batch.delete(trackingRef);
          await Promise.race([batch.commit(), timeout.promise]);
        }
      } finally {
        timeout.cancel();
      }
      this.knownLayouts.delete(this.layoutKey(user.uid, tvShowId));
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
