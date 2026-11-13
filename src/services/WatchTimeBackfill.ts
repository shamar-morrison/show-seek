import { tmdbApi } from '@/src/api/tmdb';
import { db } from '@/src/firebase/config';
import { toMillis } from '@/src/utils/timestamps';
import { getSignedInUser } from '@/src/services/serviceSupport';
import { EPISODE_PAGES_COLLECTION } from '@/functions/src/shared/episodePages';
import { getListItemPageDocId, LIST_ITEM_PAGES_COLLECTION } from '@/functions/src/shared/listPages';
import { isEpisodeListItemKey, isSeasonListItemKey } from '@/functions/src/shared/listItemKeys';
import { getUnstampedListItemRuntimeKey } from '@/src/utils/listFilters';
import { getSeasonRuntimeMinutes } from '@/src/utils/seasonListItem';
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
  /** Overflow page holding the episode (0 or absent = the show's document). */
  page?: number;
  watchedAt: number;
}

export interface UnstampedListItem {
  listId: string;
  itemKey: string;
  /** Overflow page holding the item (0 or absent = the list document). */
  page?: number;
  /**
   * For a season, `mediaId` is the show's ID and `seasonNumber` is set; an episode also has
   * `episodeNumber`. Episodes are only looked up by `resolveListItemRuntimes`.
   */
  mediaType: 'movie' | 'tv' | 'season' | 'episode';
  mediaId: number;
  seasonNumber?: number;
  episodeNumber?: number;
  addedAt: number;
}

export { getUnstampedListItemRuntimeKey };

export interface BackfillDeps {
  getShowRuntime?: (tvShowId: number) => Promise<number | null>;
  getMovieRuntime?: (movieId: number) => Promise<number | null>;
  /** A season's total runtime: the sum of its episodes' runtimes. */
  getSeasonRuntime?: (tvShowId: number, seasonNumber: number) => Promise<number | null>;
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
  /** `${showId}/${episodeKey}` -> overflow page holding the episode; absent = the show's document. */
  episodePages?: Map<string, number>;
  /** listId -> (itemKey -> measured minutes) */
  itemsByList: Map<string, Map<string, number>>;
  /** `${listId}/${itemKey}` -> overflow page holding the item; absent = the list document. */
  itemPages?: Map<string, number>;
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

async function defaultGetSeasonRuntime(
  tvShowId: number,
  seasonNumber: number
): Promise<number | null> {
  const season = await tmdbApi.getSeasonDetails(tvShowId, seasonNumber);
  return getSeasonRuntimeMinutes(season?.episodes) ?? null;
}

async function defaultGetEpisodeRuntime(
  tvShowId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<number | null> {
  const episode = await tmdbApi.getEpisodeDetails(tvShowId, seasonNumber, episodeNumber);
  const runtime = episode?.runtime;
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
    // Stamp each episode in the document that holds it: the show's document or an overflow page.
    const episodesByPage = new Map<number, Record<string, { runtimeMinutes: number }>>();
    episodes.forEach((minutes, key) => {
      const page = stamps.episodePages?.get(`${tvShowId}/${key}`) ?? 0;
      const pageEpisodes = episodesByPage.get(page) ?? {};
      pageEpisodes[key] = { runtimeMinutes: minutes };
      episodesByPage.set(page, pageEpisodes);
    });
    episodesByPage.forEach((pageEpisodes, page) => {
      const ref =
        page > 0
          ? doc(
              db,
              'users',
              user.uid,
              'episode_tracking',
              String(tvShowId),
              EPISODE_PAGES_COLLECTION,
              getListItemPageDocId(page)
            )
          : doc(db, 'users', user.uid, 'episode_tracking', String(tvShowId));
      writes.push(
        setDoc(ref, { episodes: pageEpisodes }, { merge: true }).catch((error) => {
          console.warn('[WatchTimeBackfill] Episode stamp failed:', error);
        })
      );
    });
  });

  stamps.itemsByList.forEach((items, listId) => {
    // Stamp each item in the document that holds it: the list document or an overflow page.
    // (A field-path update on the wrong document would create a partial item there.)
    const updatesByPage = new Map<number, Record<string, number>>();
    items.forEach((minutes, itemKey) => {
      const page = stamps.itemPages?.get(`${listId}/${itemKey}`) ?? 0;
      const updates = updatesByPage.get(page) ?? {};
      updates[`items.${itemKey}.runtimeMinutes`] = minutes;
      // Seasons are always stored under their season key. Their runtime is also written to
      // the field only season-aware app versions write, which is the one they read back.
      if (isSeasonListItemKey(itemKey)) {
        updates[`items.${itemKey}.seasonRuntimeMinutes`] = minutes;
      }
      // The same for episodes, whose code reads only `episodeRuntimeMinutes`.
      if (isEpisodeListItemKey(itemKey)) {
        updates[`items.${itemKey}.episodeRuntimeMinutes`] = minutes;
      }
      updatesByPage.set(page, updates);
    });
    updatesByPage.forEach((updates, page) => {
      const ref =
        page > 0
          ? doc(
              db,
              'users',
              user.uid,
              'lists',
              listId,
              LIST_ITEM_PAGES_COLLECTION,
              getListItemPageDocId(page)
            )
          : doc(db, 'users', user.uid, 'lists', listId);
      writes.push(
        updateDoc(ref, updates).catch((error) => {
          console.warn('[WatchTimeBackfill] List stamp failed:', error);
        })
      );
    });
  });

  void Promise.allSettled(writes);
}

const isAbortError = (error: unknown): boolean => {
  const status =
    (error as { status?: number })?.status ??
    (error as { response?: { status?: number } })?.response?.status;
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
const listItemAttemptKey = (
  item: Pick<UnstampedListItem, 'mediaType' | 'mediaId' | 'seasonNumber' | 'episodeNumber'>
): string => getUnstampedListItemRuntimeKey(item);

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
    getSeasonRuntime = defaultGetSeasonRuntime,
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

  // Dedupe list items by media (shows resolve via show runtime, movies via movie runtime,
  // seasons via the sum of their episodes).
  const showItems = new Map<number, UnstampedListItem[]>();
  const movieItems = new Map<number, UnstampedListItem[]>();
  const seasonItems = new Map<string, UnstampedListItem[]>();
  listItems.forEach((item) => {
    if (item.mediaType === 'tv') {
      const arr = showItems.get(item.mediaId) ?? [];
      arr.push(item);
      showItems.set(item.mediaId, arr);
    } else if (item.mediaType === 'season') {
      if (item.seasonNumber === undefined) return;
      const key = getUnstampedListItemRuntimeKey(item);
      const arr = seasonItems.get(key) ?? [];
      arr.push(item);
      seasonItems.set(key, arr);
    } else if (item.mediaType === 'episode') {
      // Stats leave episode entries out (their watches come from episode tracking).
      return;
    } else {
      const arr = movieItems.get(item.mediaId) ?? [];
      arr.push(item);
      movieItems.set(item.mediaId, arr);
    }
  });
  showItems.forEach((arr, showId) => {
    const latest = Math.max(...arr.map((i) => toMillis(i.addedAt) ?? 0));
    showWatchedAt.set(showId, Math.max(showWatchedAt.get(showId) ?? 0, latest));
  });

  type Lookup =
    | { kind: 'show'; id: number; recency: number }
    | { kind: 'movie'; id: number; recency: number }
    | { kind: 'season'; id: number; seasonNumber: number; key: string; recency: number };

  const lookups: Lookup[] = [
    ...[...showWatchedAt.entries()].map(([id, recency]): Lookup => ({ kind: 'show', id, recency })),
    ...[...movieItems.keys()].map(
      (id): Lookup => ({
        kind: 'movie',
        id,
        recency: Math.max(...(movieItems.get(id) ?? []).map((i) => toMillis(i.addedAt) ?? 0)),
      })
    ),
    ...[...seasonItems.entries()].map(
      ([key, items]): Lookup => ({
        kind: 'season',
        id: items[0].mediaId,
        seasonNumber: items[0].seasonNumber as number,
        key,
        recency: Math.max(...items.map((i) => toMillis(i.addedAt) ?? 0)),
      })
    ),
  ]
    .sort((a, b) => b.recency - a.recency)
    .slice(0, Math.max(0, Math.min(maxLookups, MAX_BACKFILL_LOOKUPS_PER_LOAD)));

  const measuredShowRuntimes = new Map<number, number>();
  const measuredMovieRuntimes = new Map<number, number>();
  const measuredSeasonRuntimes = new Map<string, number>();

  let aborted = false;
  for (let i = 0; i < lookups.length && !aborted; i += BACKFILL_BATCH_SIZE) {
    const batch = lookups.slice(i, i + BACKFILL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (lookup) => {
        try {
          const minutes =
            lookup.kind === 'show'
              ? await getShowRuntime(lookup.id)
              : lookup.kind === 'season'
                ? await getSeasonRuntime(lookup.id, lookup.seasonNumber)
                : await getMovieRuntime(lookup.id);
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
        else if (lookup.kind === 'season') measuredSeasonRuntimes.set(lookup.key, minutes);
        else measuredMovieRuntimes.set(lookup.id, minutes);
      }
    }

    if (!aborted && i + BACKFILL_BATCH_SIZE < lookups.length) {
      await sleep(BACKFILL_BATCH_GAP_MS);
    }
  }

  // Build in-memory minutes + measured-only stamps.
  const stamps: RuntimeStamps = {
    episodePages: new Map(),
    episodesByShow: new Map(),
    itemPages: new Map(),
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
      if (ep.page) {
        stamps.episodePages?.set(`${ep.tvShowId}/${ep.episodeKey}`, ep.page);
      }
    }
  });

  listItems.forEach((item) => {
    if (item.mediaType === 'episode') return;
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
        if (item.page) {
          stamps.itemPages?.set(`${item.listId}/${item.itemKey}`, item.page);
        }
      }
    } else {
      // Movies and seasons: unmeasured ones count 0 until looked up.
      const measured =
        item.mediaType === 'season'
          ? measuredSeasonRuntimes.get(getUnstampedListItemRuntimeKey(item))
          : measuredMovieRuntimes.get(item.mediaId);
      listItemMinutes.set(`${item.listId}/${item.itemKey}`, measured ?? 0);
      if (measured !== undefined) {
        let listStamps = stamps.itemsByList.get(item.listId);
        if (!listStamps) {
          listStamps = new Map();
          stamps.itemsByList.set(item.listId, listStamps);
        }
        listStamps.set(item.itemKey, measured);
        if (item.page) {
          stamps.itemPages?.set(`${item.listId}/${item.itemKey}`, item.page);
        }
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
  const freshItems = listItems.filter((i) => !attemptedThisSession.has(listItemAttemptKey(i)));

  // Record up front so overlapping runs never resolve the same title twice.
  freshEpisodes.forEach((e) => attemptedThisSession.add(episodeAttemptKey(e.tvShowId)));
  freshItems.forEach((i) => attemptedThisSession.add(listItemAttemptKey(i)));

  // Reserve session budget synchronously so overlapping runs (e.g. Stats
  // then MonthDetail in quick succession) observe each other's holds and
  // can never overshoot the shared cap combined. Reconciled (refunded)
  // against actually-issued lookups on completion.
  const distinctFreshShows = new Set<number>();
  freshEpisodes.forEach((e) => distinctFreshShows.add(e.tvShowId));
  const distinctFreshMovies = new Set<number>();
  const distinctFreshSeasons = new Set<string>();
  freshItems.forEach((i) => {
    if (i.mediaType === 'tv') distinctFreshShows.add(i.mediaId);
    else if (i.mediaType === 'season') distinctFreshSeasons.add(listItemAttemptKey(i));
    else if (i.mediaType !== 'episode') distinctFreshMovies.add(i.mediaId);
  });
  const reservation = Math.max(
    0,
    Math.min(
      distinctFreshShows.size + distinctFreshMovies.size + distinctFreshSeasons.size,
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
      const countingGetSeasonRuntime = async (tvShowId: number, seasonNumber: number) => {
        issuedLookups += 1;
        return (deps.getSeasonRuntime ?? defaultGetSeasonRuntime)(tvShowId, seasonNumber);
      };
      await resolveMissingRuntimes(freshEpisodes, freshItems, {
        getShowRuntime: countingGetShowRuntime,
        getMovieRuntime: countingGetMovieRuntime,
        getSeasonRuntime: countingGetSeasonRuntime,
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

/** Most distinct titles looked up in one runtime-filter run. */
export const MAX_FILTER_RUNTIME_LOOKUPS = 300;

export interface ListRuntimeLookupOptions {
  getShowRuntime?: (tvShowId: number) => Promise<number | null>;
  getMovieRuntime?: (movieId: number) => Promise<number | null>;
  getSeasonRuntime?: (tvShowId: number, seasonNumber: number) => Promise<number | null>;
  getEpisodeRuntime?: (
    tvShowId: number,
    seasonNumber: number,
    episodeNumber: number
  ) => Promise<number | null>;
  stampRuntimes?: (stamps: RuntimeStamps) => void;
  /** Called after each batch with the titles looked up so far and every runtime found. */
  onProgress?: (progress: { done: number; total: number; runtimes: Map<string, number> }) => void;
  /** Checked between batches; when true the run stops and saves what it found. */
  isCancelled?: () => boolean;
}

/**
 * Looks up runtimes for list items that have none stored, for the list runtime filter.
 *
 * Unlike background backfill this runs because the user asked for it, so it is not limited
 * by the per-session budget, only by MAX_FILTER_RUNTIME_LOOKUPS. Each title is looked up
 * once, in TMDB-paced batches, and the run stops on rate limits or timeouts. Measured values
 * are saved back to the items (one write per list document or overflow page) when the run
 * ends, so later visits need no lookups.
 *
 * @returns Measured runtimes keyed by `getUnstampedListItemRuntimeKey`.
 */
export async function resolveListItemRuntimes(
  items: UnstampedListItem[],
  options: ListRuntimeLookupOptions = {}
): Promise<Map<string, number>> {
  const {
    getShowRuntime = defaultGetShowRuntime,
    getMovieRuntime = defaultGetMovieRuntime,
    getSeasonRuntime = defaultGetSeasonRuntime,
    getEpisodeRuntime = defaultGetEpisodeRuntime,
    stampRuntimes = defaultStampRuntimes,
    onProgress,
    isCancelled,
  } = options;

  // One lookup per title, newest additions first so the cap keeps the most recent ones.
  const titles = new Map<
    string,
    Pick<UnstampedListItem, 'mediaType' | 'mediaId' | 'seasonNumber' | 'episodeNumber'> & {
      recency: number;
    }
  >();
  items.forEach((item) => {
    if (item.mediaType === 'season' && item.seasonNumber === undefined) return;
    if (
      item.mediaType === 'episode' &&
      (item.seasonNumber === undefined || item.episodeNumber === undefined)
    ) {
      return;
    }
    const key = getUnstampedListItemRuntimeKey(item);
    const recency = toMillis(item.addedAt) ?? 0;
    const existing = titles.get(key);
    if (!existing || recency > existing.recency) {
      titles.set(key, {
        mediaType: item.mediaType,
        mediaId: item.mediaId,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        recency,
      });
    }
  });
  const lookups = [...titles.entries()]
    .sort(([, a], [, b]) => b.recency - a.recency)
    .slice(0, MAX_FILTER_RUNTIME_LOOKUPS);

  const runtimes = new Map<string, number>();
  let done = 0;
  let aborted = false;

  for (let i = 0; i < lookups.length && !aborted; i += BACKFILL_BATCH_SIZE) {
    if (isCancelled?.()) break;
    const batch = lookups.slice(i, i + BACKFILL_BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async ([key, { mediaType, mediaId, seasonNumber, episodeNumber }]) => {
        try {
          const minutes =
            mediaType === 'tv'
              ? await getShowRuntime(mediaId)
              : mediaType === 'season'
                ? await getSeasonRuntime(mediaId, seasonNumber as number)
                : mediaType === 'episode'
                  ? await getEpisodeRuntime(
                      mediaId,
                      seasonNumber as number,
                      episodeNumber as number
                    )
                  : await getMovieRuntime(mediaId);
          return { key, minutes, error: undefined as unknown };
        } catch (error) {
          return { key, minutes: null, error };
        }
      })
    );

    for (const { key, minutes, error } of results) {
      if (error !== undefined && isAbortError(error)) {
        aborted = true;
        break;
      }
      if (typeof minutes === 'number' && minutes > 0) {
        runtimes.set(key, minutes);
      }
    }
    done += batch.length;
    if (!isCancelled?.()) {
      onProgress?.({ done, total: lookups.length, runtimes: new Map(runtimes) });
    }

    if (!aborted && i + BACKFILL_BATCH_SIZE < lookups.length && !isCancelled?.()) {
      await sleep(BACKFILL_BATCH_GAP_MS);
    }
  }

  // Save measured values onto every item of that title, in the document that holds it.
  const stamps: RuntimeStamps = {
    episodesByShow: new Map(),
    itemsByList: new Map(),
    itemPages: new Map(),
  };
  items.forEach((item) => {
    const minutes = runtimes.get(getUnstampedListItemRuntimeKey(item));
    if (minutes === undefined) return;
    let listStamps = stamps.itemsByList.get(item.listId);
    if (!listStamps) {
      listStamps = new Map();
      stamps.itemsByList.set(item.listId, listStamps);
    }
    listStamps.set(item.itemKey, minutes);
    if (item.page) {
      stamps.itemPages?.set(`${item.listId}/${item.itemKey}`, item.page);
    }
  });
  if (stamps.itemsByList.size > 0) {
    try {
      stampRuntimes(stamps);
    } catch (error) {
      console.warn('[WatchTimeBackfill] Stamp dispatch failed:', error);
    }
  }

  return runtimes;
}
