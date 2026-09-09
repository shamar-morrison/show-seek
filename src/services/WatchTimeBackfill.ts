import { tmdbApi } from '@/src/api/tmdb';
import { db } from '@/src/firebase/config';
import { getSignedInUser } from '@/src/services/serviceSupport';
import { doc, setDoc, updateDoc } from 'firebase/firestore';

/**
 * Lazy on-demand backfill for `runtimeMinutes` watch-time data.
 *
 * When a watched episode or already-watched list item has no stamped
 * `runtimeMinutes`, the current calculation resolves it from TMDB (bounded,
 * deduped, throttled) and stamps the measured value back to Firestore with
 * fire-and-forget writes so it is never looked up again.
 *
 * Rules (per approved plan):
 * - Max 10 distinct titles (shows/movies) per call, most-recent-first.
 * - TMDB calls run in batches of 5 with a 250ms gap between batches.
 * - Episode in-memory fallback is 45 min; movie fallback is 0. Fallbacks are
 *   NEVER stamped — only measured TMDB values are written.
 * - Firestore stamps are fire-and-forget (`void`) and use `setDoc(..., { merge: true })`
 *   on episode_tracking docs so concurrent writes are not clobbered.
 * - Silent abort of remaining batches on 429/timeout.
 */

/** In-memory per-episode fallback when TMDB yields no runtime. Never persisted. */
export const EPISODE_RUNTIME_FALLBACK_MINUTES = 45;
/** Max distinct shows/movies resolved from TMDB in a single stats load. */
export const MAX_BACKFILL_LOOKUPS_PER_LOAD = 10;
/** TMDB calls per batch (mirrors backend enrichment pacing). */
export const BACKFILL_BATCH_SIZE = 5;
/** Gap between TMDB batches in ms (mirrors backend enrichment pacing). */
export const BACKFILL_BATCH_GAP_MS = 250;

export interface UnstampedEpisode {
  tvShowId: number;
  episodeKey: string;
  watchedAt: number;
}

export interface UnstampedListItem {
  listId: string;
  itemKey: string;
  mediaType: 'movie' | 'tv';
  mediaId: number;
  addedAt: number;
}

export interface BackfillDeps {
  getShowRuntime?: (tvShowId: number) => Promise<number | null>;
  getMovieRuntime?: (movieId: number) => Promise<number | null>;
  /** Fire-and-forget stamp sink. Defaults to real Firestore writes. */
  stampRuntimes?: (stamps: RuntimeStamps) => void;
  /** Called when a background backfill run settles; true when values were stamped. */
  onStampsSettled?: (didStamp: boolean) => void;
  /**
   * Cap on distinct-title TMDB lookups for this call. Defaults to
   * MAX_BACKFILL_LOOKUPS_PER_LOAD and is always clamped to it, so callers
   * can only spend *less* than the per-call ceiling (used to enforce the
   * shared per-session budget in backfillRuntimes).
   */
  maxLookups?: number;
}

export interface RuntimeStamps {
  /** showId -> (episodeKey -> measured minutes) */
  episodesByShow: Map<number, Map<string, number>>;
  /** listId -> (itemKey -> measured minutes) */
  itemsByList: Map<string, Map<string, number>>;
}

export interface ResolvedRuntimes {
  /** episodeKey (within its show context, keyed `${tvShowId}/${episodeKey}`) -> minutes for calc */
  episodeMinutes: Map<string, number>;
  /** `${listId}/${itemKey}` -> minutes for calc */
  listItemMinutes: Map<string, number>;
}

async function defaultGetShowRuntime(tvShowId: number): Promise<number | null> {
  const details = await tmdbApi.getTVShowDetails(tvShowId);
  const runtime = details?.episode_run_time?.[0];
  return typeof runtime === 'number' && runtime > 0 ? runtime : null;
}

async function defaultGetMovieRuntime(movieId: number): Promise<number | null> {
  const details = await tmdbApi.getMovieDetails(movieId);
  const runtime = details?.runtime;
  return typeof runtime === 'number' && runtime > 0 ? runtime : null;
}

function defaultStampRuntimes(stamps: RuntimeStamps): void {
  const user = getSignedInUser();
  if (!user) return;

  const writes: Promise<unknown>[] = [];

  stamps.episodesByShow.forEach((episodes, tvShowId) => {
    writes.push(
      setDoc(
        doc(db, 'users', user.uid, 'episode_tracking', String(tvShowId)),
        { episodes: Object.fromEntries([...episodes].map(([key, minutes]) => [key, { runtimeMinutes: minutes }])) },
        { merge: true }
      ).catch((error) => {
        console.warn('[WatchTimeBackfill] Episode stamp failed:', error);
      })
    );
  });

  stamps.itemsByList.forEach((items, listId) => {
    const updates: Record<string, number> = {};
    items.forEach((minutes, itemKey) => {
      updates[`items.${itemKey}.runtimeMinutes`] = minutes;
    });
    writes.push(
      updateDoc(doc(db, 'users', user.uid, 'lists', listId), updates).catch((error) => {
        console.warn('[WatchTimeBackfill] List stamp failed:', error);
      })
    );
  });

  void Promise.allSettled(writes);
}

const isAbortError = (error: unknown): boolean => {
  const status =
    (error as { status?: number })?.status ?? (error as { response?: { status?: number } })?.response?.status;
  const code = (error as { code?: string })?.code;
  const message = ((error as { message?: string })?.message ?? '').toLowerCase();
  return (
    status === 429 ||
    code === 'TMDB_TIMEOUT' ||
    code === 'ECONNABORTED' ||
    message.includes('timeout') ||
    message.includes('rate limit')
  );
};

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Titles already attempted this session (resolved or aborted). Skipping them
 * on later runs keeps background backfill from re-hitting TMDB for the same
 * titles and guarantees settle-triggered refetches always terminate, even
 * when stamps fail to land (e.g. offline).
 */
const attemptedThisSession = new Set<string>();

const episodeAttemptKey = (tvShowId: number): string => `show:${tvShowId}`;
const listItemAttemptKey = (mediaType: 'movie' | 'tv', mediaId: number): string =>
  `${mediaType}:${mediaId}`;

/**
 * TMDB lookups issued this session across all backfillRuntimes calls.
 * Together with the per-call ceiling, this enforces the shared session
 * budget: overview + month-detail screens draw from the same 10 lookups,
 * keeping total TMDB traffic near ~25% of the 10s budget per visit.
 */
let sessionLookupsSpent = 0;

/** For tests: reset the session attempt tracking. */
export function resetBackfillSessionForTests(): void {
  attemptedThisSession.clear();
  sessionLookupsSpent = 0;
}

/**
 * Resolve runtimes for unstamped entries. Returns in-memory minutes for the
 * current calculation and kicks off fire-and-forget Firestore stamps for
 * measured values only.
 */
export async function resolveMissingRuntimes(
  episodes: UnstampedEpisode[],
  listItems: UnstampedListItem[],
  deps: BackfillDeps = {}
): Promise<ResolvedRuntimes> {
  const {
    getShowRuntime = defaultGetShowRuntime,
    getMovieRuntime = defaultGetMovieRuntime,
    stampRuntimes = defaultStampRuntimes,
    maxLookups = MAX_BACKFILL_LOOKUPS_PER_LOAD,
  } = deps;

  const episodeMinutes = new Map<string, number>();
  const listItemMinutes = new Map<string, number>();

  // Dedupe shows by tvShowId (most recent watchedAt wins ordering).
  const showWatchedAt = new Map<number, number>();
  episodes.forEach((ep) => {
    showWatchedAt.set(ep.tvShowId, Math.max(showWatchedAt.get(ep.tvShowId) ?? 0, ep.watchedAt));
  });

  // Dedupe list items by media (shows resolve via show runtime, movies via movie runtime).
  const showItems = new Map<number, UnstampedListItem[]>();
  const movieItems = new Map<number, UnstampedListItem[]>();
  listItems.forEach((item) => {
    if (item.mediaType === 'tv') {
      const arr = showItems.get(item.mediaId) ?? [];
      arr.push(item);
      showItems.set(item.mediaId, arr);
    } else {
      const arr = movieItems.get(item.mediaId) ?? [];
      arr.push(item);
      movieItems.set(item.mediaId, arr);
    }
  });
  showItems.forEach((arr, showId) => {
    const latest = Math.max(...arr.map((i) => i.addedAt));
    showWatchedAt.set(showId, Math.max(showWatchedAt.get(showId) ?? 0, latest));
  });

  type Lookup =
    | { kind: 'show'; id: number; recency: number }
    | { kind: 'movie'; id: number; recency: number };

  const lookups: Lookup[] = [
    ...[...showWatchedAt.entries()].map(([id, recency]): Lookup => ({ kind: 'show', id, recency })),
    ...[...movieItems.keys()].map(
      (id): Lookup => ({
        kind: 'movie',
        id,
        recency: Math.max(...(movieItems.get(id) ?? []).map((i) => i.addedAt)),
      })
    ),
  ]
    .sort((a, b) => b.recency - a.recency)
    .slice(
      0,
      Math.max(0, Math.min(maxLookups, MAX_BACKFILL_LOOKUPS_PER_LOAD))
    );

  const measuredShowRuntimes = new Map<number, number>();
  const measuredMovieRuntimes = new Map<number, number>();

  let aborted = false;
  for (let i = 0; i < lookups.length && !aborted; i += BACKFILL_BATCH_SIZE) {
    const batch = lookups.slice(i, i + BACKFILL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (lookup) => {
        try {
          const minutes =
            lookup.kind === 'show' ? await getShowRuntime(lookup.id) : await getMovieRuntime(lookup.id);
          return { lookup, minutes };
        } catch (error) {
          return { lookup, minutes: null, error };
        }
      })
    );

    for (const { lookup, minutes, error } of results) {
      if (error !== undefined && isAbortError(error)) {
        aborted = true;
        break;
      }
      if (typeof minutes === 'number' && minutes > 0) {
        if (lookup.kind === 'show') measuredShowRuntimes.set(lookup.id, minutes);
        else measuredMovieRuntimes.set(lookup.id, minutes);
      }
    }

    if (!aborted && i + BACKFILL_BATCH_SIZE < lookups.length) {
      await sleep(BACKFILL_BATCH_GAP_MS);
    }
  }

  // Build in-memory minutes + measured-only stamps.
  const stamps: RuntimeStamps = {
    episodesByShow: new Map(),
    itemsByList: new Map(),
  };

  episodes.forEach((ep) => {
    const measured = measuredShowRuntimes.get(ep.tvShowId);
    episodeMinutes.set(
      `${ep.tvShowId}/${ep.episodeKey}`,
      measured ?? EPISODE_RUNTIME_FALLBACK_MINUTES
    );
    if (measured !== undefined) {
      let showStamps = stamps.episodesByShow.get(ep.tvShowId);
      if (!showStamps) {
        showStamps = new Map();
        stamps.episodesByShow.set(ep.tvShowId, showStamps);
      }
      showStamps.set(ep.episodeKey, measured);
    }
  });

  listItems.forEach((item) => {
    if (item.mediaType === 'tv') {
      const measured = measuredShowRuntimes.get(item.mediaId);
      listItemMinutes.set(
        `${item.listId}/${item.itemKey}`,
        measured ?? EPISODE_RUNTIME_FALLBACK_MINUTES
      );
      if (measured !== undefined) {
        let listStamps = stamps.itemsByList.get(item.listId);
        if (!listStamps) {
          listStamps = new Map();
          stamps.itemsByList.set(item.listId, listStamps);
        }
        listStamps.set(item.itemKey, measured);
      }
    } else {
      const measured = measuredMovieRuntimes.get(item.mediaId);
      listItemMinutes.set(`${item.listId}/${item.itemKey}`, measured ?? 0);
      if (measured !== undefined) {
        let listStamps = stamps.itemsByList.get(item.listId);
        if (!listStamps) {
          listStamps = new Map();
          stamps.itemsByList.set(item.listId, listStamps);
        }
        listStamps.set(item.itemKey, measured);
      }
    }
  });

  if (stamps.episodesByShow.size > 0 || stamps.itemsByList.size > 0) {
    try {
      stampRuntimes(stamps);
    } catch (error) {
      console.warn('[WatchTimeBackfill] Stamp dispatch failed:', error);
    }
  }

  return { episodeMinutes, listItemMinutes };
}

/**
 * Background backfill entry point. Resolves and stamps runtimes without
 * blocking the caller and reports whether anything was stamped via
 * `onStampsSettled` (used to refresh stats screens to measured values).
 *
 * Titles already attempted this session are skipped, so settle-triggered
 * refetches can never loop: a refetch finds nothing new to resolve, stamps
 * nothing, and settles with `false`.
 *
 * TMDB traffic draws from a shared per-session budget of
 * MAX_BACKFILL_LOOKUPS_PER_LOAD lookups across all calls (overview +
 * month-detail screens share it), so a visit stays near ~25% of TMDB's
 * 10s budget no matter how many stats screens load. Budget is reserved
 * synchronously at dispatch and reconciled against issued calls on
 * completion, so overlapping runs can never overshoot it combined.
 */
export function backfillRuntimes(
  episodes: UnstampedEpisode[],
  listItems: UnstampedListItem[],
  deps: BackfillDeps = {}
): void {
  const freshEpisodes = episodes.filter(
    (e) => !attemptedThisSession.has(episodeAttemptKey(e.tvShowId))
  );
  const freshItems = listItems.filter(
    (i) => !attemptedThisSession.has(listItemAttemptKey(i.mediaType, i.mediaId))
  );

  // Record up front so overlapping runs never resolve the same title twice.
  freshEpisodes.forEach((e) => attemptedThisSession.add(episodeAttemptKey(e.tvShowId)));
  freshItems.forEach((i) =>
    attemptedThisSession.add(listItemAttemptKey(i.mediaType, i.mediaId))
  );

  // Reserve session budget synchronously so overlapping runs (e.g. Stats
  // then MonthDetail in quick succession) observe each other's holds and
  // can never overshoot the shared cap combined. Reconciled (refunded)
  // against actually-issued lookups on completion.
  const distinctFreshShows = new Set<number>();
  freshEpisodes.forEach((e) => distinctFreshShows.add(e.tvShowId));
  const distinctFreshMovies = new Set<number>();
  freshItems.forEach((i) => {
    if (i.mediaType === 'tv') distinctFreshShows.add(i.mediaId);
    else distinctFreshMovies.add(i.mediaId);
  });
  const reservation = Math.max(
    0,
    Math.min(
      distinctFreshShows.size + distinctFreshMovies.size,
      MAX_BACKFILL_LOOKUPS_PER_LOAD - sessionLookupsSpent
    )
  );
  sessionLookupsSpent += reservation;

  if (freshEpisodes.length === 0 && freshItems.length === 0) {
    deps.onStampsSettled?.(false);
    return;
  }

  const { onStampsSettled, stampRuntimes = defaultStampRuntimes } = deps;
  void (async () => {
    let didStamp = false;
    try {
      // Count issued TMDB calls (not just resolved titles) so the shared
      // session budget reflects real traffic even when calls abort or 404.
      let issuedLookups = 0;
      const countingGetShowRuntime = async (tvShowId: number) => {
        issuedLookups += 1;
        return (deps.getShowRuntime ?? defaultGetShowRuntime)(tvShowId);
      };
      const countingGetMovieRuntime = async (movieId: number) => {
        issuedLookups += 1;
        return (deps.getMovieRuntime ?? defaultGetMovieRuntime)(movieId);
      };
      await resolveMissingRuntimes(freshEpisodes, freshItems, {
        getShowRuntime: countingGetShowRuntime,
        getMovieRuntime: countingGetMovieRuntime,
        maxLookups: reservation,
        stampRuntimes: (stamps) => {
          didStamp = true;
          stampRuntimes(stamps);
        },
      });
      // Refund the reserved-but-unused share (abort/empty runs). issued can
      // never exceed reservation, so the session total stays within budget.
      sessionLookupsSpent = Math.max(0, sessionLookupsSpent + issuedLookups - reservation);
    } catch (error) {
      console.warn('[WatchTimeBackfill] Background backfill failed:', error);
    } finally {
      onStampsSettled?.(didStamp);
    }
  })();
}
