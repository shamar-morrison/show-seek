import { fetchTMDBJson } from './client';
import { getTraktEpisodeRef, isWholeNumber } from './seasons';
import { TraktSyncError, type TraktIds } from './types';

/** A TMDB season's episodes, as far as numbering needs them. */
export interface TMDBSeasonEpisodeNumbers {
  episodes?: { episode_number?: number; id?: number; season_number?: number }[];
}

/** TMDB `/find` results for an external episode ID. */
export interface TMDBFindEpisodeResponse {
  tv_episode_results?: { episode_number?: number; season_number?: number; show_id?: number }[];
}

export interface EpisodeNumberLookup {
  /** The season's episodes, or null when TMDB has no such season (or show). */
  getSeason: (tvId: number, seasonNumber: number) => Promise<TMDBSeasonEpisodeNumbers | null>;
  /** Episodes TMDB knows by this TVDB or IMDb ID, or null when it knows none. */
  findEpisode: (
    externalId: string,
    source: 'tvdb_id' | 'imdb_id'
  ) => Promise<TMDBFindEpisodeResponse | null>;
}

/**
 * Most TMDB requests one sync run (or ZIP import) makes for episode numbering, across the
 * watchlist and every list: they share one session (createEpisodeNumberSession), so a show's
 * season is fetched once however many of its episodes are listed anywhere. Requests are
 * sequential, well under TMDB's rate limit. Episodes past the budget are saved as their show;
 * with lookups shared across the run, only accounts listing episodes from thousands of seasons
 * reach it.
 */
export const MAX_EPISODE_NUMBER_LOOKUPS = 2000;

/** Retries of a rate-limited TMDB request, and the longest wait honored before each. */
const MAX_RATE_LIMIT_RETRIES = 2;
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

const defaultLookup: EpisodeNumberLookup = {
  getSeason: (tvId, seasonNumber) =>
    fetchTMDBJson<TMDBSeasonEpisodeNumbers>(`/tv/${tvId}/season/${seasonNumber}`),
  findEpisode: (externalId, source) =>
    fetchTMDBJson<TMDBFindEpisodeResponse>(
      `/find/${encodeURIComponent(externalId)}?external_source=${source}`
    ),
};

interface TraktEpisodeEntry {
  episode?: {
    ids?: Partial<TraktIds>;
    number?: number;
    season?: number;
    title?: string;
  } | null;
  show?: { ids?: Partial<TraktIds> } | null;
  type?: string;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A failed numbering lookup, as the `tmdb_unavailable` error the sync handles per list (it
 * isn't run-fatal). Retryable unless TMDB itself said retrying can't help (e.g. a bad key).
 */
const toTmdbUnavailableError = (error: unknown): TraktSyncError => {
  const source = error instanceof TraktSyncError ? error : undefined;
  return new TraktSyncError(
    "Couldn't reach TMDB to check episode numbering.",
    'tmdb_unavailable',
    source ? source.retryable : true,
    {
      endpoint: source?.endpoint,
      retryAfterSeconds: source?.retryAfterSeconds,
      statusCode: source?.statusCode,
    }
  );
};

/** Whether an error is a failed TMDB lookup for episode numbering. */
export const isTmdbUnavailableError = (error: unknown): error is TraktSyncError =>
  error instanceof TraktSyncError && error.category === 'tmdb_unavailable';

/** What a lookup returns once the run's request budget is spent. */
const BUDGET_SPENT = Symbol('budgetSpent');
type Looked<R> = R | typeof BUDGET_SPENT;

/**
 * TMDB lookups for one sync run or ZIP import, shared by the watchlist and every list: one
 * request budget, and each show's season fetched once.
 *
 * A lookup that fails (an outage, a timeout, or a rate limit that outlasts the retries) throws a
 * `tmdb_unavailable` error instead of guessing. The sync then leaves that list untouched, syncs
 * everything else, and fails the run at the end so it doesn't save its progress and the task
 * queue retries it. Saving unconfirmed episodes as their show would instead replace episode
 * entries already confirmed in custom lists, which are only re-read when Trakt reports a
 * change.
 */
export interface EpisodeNumberSession {
  /** The season's episodes, null when TMDB has no such season, or BUDGET_SPENT. */
  getSeason: (
    tvId: number,
    seasonNumber: number
  ) => Promise<Looked<TMDBSeasonEpisodeNumbers | null>>;
  /** Episodes TMDB knows by this ID, null when it knows none, or BUDGET_SPENT. */
  findEpisode: (
    externalId: string,
    source: 'tvdb_id' | 'imdb_id'
  ) => Promise<Looked<TMDBFindEpisodeResponse | null>>;
}

export const createEpisodeNumberSession = ({
  lookup = defaultLookup,
  maxLookups = MAX_EPISODE_NUMBER_LOOKUPS,
}: { lookup?: EpisodeNumberLookup; maxLookups?: number } = {}): EpisodeNumberSession => {
  const seasons = new Map<string, Promise<Looked<TMDBSeasonEpisodeNumbers | null>>>();
  let lookupsLeft = maxLookups;

  const request = async <R>(run: () => Promise<R>): Promise<Looked<R>> => {
    for (let attempt = 0; ; attempt += 1) {
      if (lookupsLeft <= 0) return BUDGET_SPENT;
      lookupsLeft -= 1;
      try {
        return await run();
      } catch (error) {
        const isRateLimited = error instanceof TraktSyncError && error.category === 'rate_limited';
        if (isRateLimited && attempt < MAX_RATE_LIMIT_RETRIES) {
          const retryAfterMs = (error.retryAfterSeconds ?? 2 ** attempt) * 1000;
          await sleep(Math.min(retryAfterMs, MAX_RATE_LIMIT_WAIT_MS));
          continue;
        }
        throw toTmdbUnavailableError(error);
      }
    }
  };

  return {
    getSeason: (tvId, seasonNumber) => {
      const key = `${tvId}:${seasonNumber}`;
      let season = seasons.get(key);
      if (!season) {
        season = request(() => lookup.getSeason(tvId, seasonNumber));
        seasons.set(key, season);
      }
      return season;
    },
    findEpisode: (externalId, source) => request(() => lookup.findEpisode(externalId, source)),
  };
};

/**
 * The entry saved as its show: what Trakt episodes always were before ShowSeek lists held
 * episodes. A show entry always opens, unlike an episode TMDB can't find.
 */
const asShowEntry = <T extends TraktEpisodeEntry>(item: T): T => {
  const { episode: _episode, ...rest } = item;
  return { ...rest, type: 'show' } as T;
};

/**
 * Makes every Trakt episode entry one ShowSeek can open. ShowSeek keys and opens episodes by
 * TMDB's numbers, and Trakt numbers some shows (anime, shows aired out of order) as TVDB does,
 * so each episode entry is checked against TMDB before it is keyed:
 * 1. the TMDB season with Trakt's number is fetched (once per show and season for the whole
 *    run); when it holds Trakt's TMDB episode ID, the entry takes that episode's numbers;
 * 2. an entry without a TMDB ID keeps Trakt's numbers when TMDB has an episode at them;
 * 3. otherwise the episode is found by its TVDB, then IMDb, ID through TMDB `/find`, and takes
 *    that result's numbers when it belongs to the same show;
 * 4. otherwise it keeps Trakt's numbers if TMDB has an episode at them.
 * An episode TMDB doesn't have (or one past the run's request budget) is saved as its show
 * instead, so no list entry leads to a screen that can't load. A show entry made this way is
 * dropped when Trakt lists the show itself, or another of its episodes already became the show,
 * so it never overwrites that entry.
 *
 * A failed lookup throws (see EpisodeNumberSession). Entries that aren't episodes are returned
 * untouched, and no request is made without episodes.
 */
export async function alignTraktEpisodeNumbers<T extends TraktEpisodeEntry>(
  items: T[],
  {
    lookup,
    maxLookups,
    session = createEpisodeNumberSession({ lookup, maxLookups }),
  }: {
    /** The run's shared lookups; a new session (from `lookup`, `maxLookups`) when omitted. */
    session?: EpisodeNumberSession;
    lookup?: EpisodeNumberLookup;
    maxLookups?: number;
  } = {}
): Promise<T[]> {
  if (!Array.isArray(items) || !items.some((item) => item && getTraktEpisodeRef(item))) {
    return items;
  }

  /** TMDB's numbers for the episode, or null when it can't be confirmed. */
  const findByExternalId = async (
    tvId: number,
    ids: Partial<TraktIds> | undefined
  ): Promise<{ season: number; episode: number } | null> => {
    const candidates: [string | undefined, 'tvdb_id' | 'imdb_id'][] = [
      [ids?.tvdb !== undefined && ids.tvdb !== null ? String(ids.tvdb) : undefined, 'tvdb_id'],
      [ids?.imdb || undefined, 'imdb_id'],
    ];
    for (const [externalId, source] of candidates) {
      if (!externalId) continue;
      const found = await session.findEpisode(externalId, source);
      if (found === BUDGET_SPENT) return null;
      const match = found?.tv_episode_results?.find((result) => result.show_id === tvId);
      if (match && isWholeNumber(match.season_number) && isWholeNumber(match.episode_number)) {
        return { season: match.season_number, episode: match.episode_number };
      }
    }
    return null;
  };

  const confirmNumbers = async (
    tvId: number,
    episode: NonNullable<TraktEpisodeEntry['episode']>,
    ref: { seasonNumber: number; episodeNumber: number }
  ): Promise<{ season: number; episode: number } | null> => {
    const looked = await session.getSeason(tvId, ref.seasonNumber);
    if (looked === BUDGET_SPENT) return null;
    const season = looked;
    const tmdbEpisodeId = episode.ids?.tmdb;
    const byId =
      typeof tmdbEpisodeId === 'number'
        ? season?.episodes?.find((entry) => entry.id === tmdbEpisodeId)
        : undefined;
    if (byId && isWholeNumber(byId.episode_number)) {
      return {
        season: isWholeNumber(byId.season_number) ? byId.season_number : ref.seasonNumber,
        episode: byId.episode_number,
      };
    }
    const hasNumber = !!season?.episodes?.some(
      (entry) => entry.episode_number === ref.episodeNumber
    );
    const atTraktNumbers = { season: ref.seasonNumber, episode: ref.episodeNumber };
    // Without Trakt's TMDB ID there's nothing to contradict the numbers, so no `/find` is needed.
    if (typeof tmdbEpisodeId !== 'number' && hasNumber) {
      return atTraktNumbers;
    }
    const found = await findByExternalId(tvId, episode.ids);
    if (found) {
      return found;
    }
    return hasNumber ? atTraktNumbers : null;
  };

  // Shows Trakt lists as shows, so an unconfirmed episode of one adds nothing.
  const listedShowIds = new Set(
    items
      .filter((item) => item?.type === 'show' && typeof item.show?.ids?.tmdb === 'number')
      .map((item) => item.show!.ids!.tmdb as number)
  );
  const aligned: T[] = [];
  for (const item of items) {
    const ref = item ? getTraktEpisodeRef(item) : undefined;
    const tvId = item?.show?.ids?.tmdb;
    if (!ref || typeof tvId !== 'number' || tvId <= 0 || !item.episode) {
      aligned.push(item);
      continue;
    }

    const numbers = await confirmNumbers(tvId, item.episode, ref);
    if (!numbers) {
      if (!listedShowIds.has(tvId)) {
        listedShowIds.add(tvId);
        aligned.push(asShowEntry(item));
      }
    } else if (numbers.season === ref.seasonNumber && numbers.episode === ref.episodeNumber) {
      aligned.push(item);
    } else {
      aligned.push({
        ...item,
        episode: { ...item.episode, number: numbers.episode, season: numbers.season },
      });
    }
  }
  return aligned;
}
