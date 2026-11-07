import { MovieDetails, tmdbApi, TVShowDetails } from '@/src/api/tmdb';
import { getRegionalReleaseDate } from '@/src/utils/mediaUtils';
import { createPersistentCache } from '@/src/utils/persistentCache';
import { enqueueTmdbBulkRequest } from '@/src/utils/tmdbBulkRequests';

/**
 * Release Calendar enrichment: the minimum TMDB data the calendar needs per title,
 * kept as compact summaries so thousands of them can live in memory and on disk.
 *
 * Summaries are cached on device and handed to React Query as initial data, so the
 * calendar renders immediately on launch and only refreshes what is stale.
 */

export interface CalendarEpisode {
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  airDate: string | null;
}

export interface CalendarTvSummary {
  k: 'tv';
  name: string;
  status: string;
  backdropPath: string | null;
  /** Season whose episodes the calendar should load, or null if none can be upcoming. */
  seasonToFetch: number | null;
  nextEpisode: CalendarEpisode | null;
}

export interface CalendarSeasonSummary {
  k: 'season';
  episodes: CalendarEpisode[];
}

export interface CalendarMovieSummary {
  k: 'movie';
  /** Region-specific release date (YYYY-MM-DD), or null if TMDB has none. */
  releaseDate: string | null;
  backdropPath: string | null;
}

type CalendarSummary = CalendarTvSummary | CalendarSeasonSummary | CalendarMovieSummary;

// Shows that may still get new episodes.
const ACTIVE_STATUSES = ['Returning Series', 'In Production'];
const FINISHED_STATUSES = ['Ended', 'Canceled'];

/** How long fetched data counts as fresh before a background refresh. */
export const CALENDAR_FRESH_TIME_MS = 1000 * 60 * 60 * 12; // 12 hours
/** Ended/canceled shows and already-released movies rarely change. */
export const CALENDAR_SETTLED_FRESH_TIME_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
export const CALENDAR_GC_TIME_MS = 1000 * 60 * 60; // 1 hour

/**
 * Movies whose list-item release date is older than this are skipped entirely:
 * regional release dates don't trail the primary date by more than a year.
 */
export const CALENDAR_MOVIE_LOOKBACK_MS = 1000 * 60 * 60 * 24 * 365;

const isValidSummary = (value: unknown): value is CalendarSummary => {
  const kind = (value as { k?: unknown } | null)?.k;
  return kind === 'tv' || kind === 'season' || kind === 'movie';
};

export const calendarEnrichmentCache = createPersistentCache<CalendarSummary>({
  storageKey: 'showseek_calendar_enrichment_v1',
  version: 1,
  maxEntries: 20000,
  isValidValue: isValidSummary,
});

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const calendarTvQueryKey = (showId: number) => ['calendar', 'tv', showId] as const;
export const calendarSeasonQueryKey = (showId: number, seasonNumber: number) =>
  ['calendar', 'season', showId, seasonNumber] as const;
export const calendarMovieQueryKey = (movieId: number, region: string) =>
  ['calendar', 'movie', movieId, region] as const;

export function isCalendarEnrichmentQueryKey(queryKey: readonly unknown[]): boolean {
  return queryKey[0] === 'calendar';
}

const tvCacheKey = (showId: number) => `tv:${showId}`;
const seasonCacheKey = (showId: number, seasonNumber: number) => `season:${showId}:${seasonNumber}`;
const movieCacheKey = (movieId: number, region: string) => `movie:${region}:${movieId}`;

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

function getSeasonToFetch(details: TVShowDetails): number | null {
  if (details.next_episode_to_air?.season_number) {
    return details.next_episode_to_air.season_number;
  }

  if (ACTIVE_STATUSES.includes(details.status) && details.seasons?.length > 0) {
    const regularSeasons = details.seasons.filter((season) => season.season_number > 0);
    if (regularSeasons.length > 0) {
      return Math.max(...regularSeasons.map((season) => season.season_number));
    }
  }

  return null;
}

export function summarizeTvDetails(details: TVShowDetails): CalendarTvSummary {
  const next = details.next_episode_to_air;
  return {
    k: 'tv',
    name: details.name,
    status: details.status,
    backdropPath: details.backdrop_path ?? null,
    seasonToFetch: getSeasonToFetch(details),
    nextEpisode: next
      ? {
          seasonNumber: next.season_number,
          episodeNumber: next.episode_number,
          name: next.name,
          airDate: next.air_date ?? null,
        }
      : null,
  };
}

export function summarizeMovieDetails(details: MovieDetails, region: string): CalendarMovieSummary {
  return {
    k: 'movie',
    releaseDate: getRegionalReleaseDate(details, region),
    backdropPath: details.backdrop_path ?? null,
  };
}

// ---------------------------------------------------------------------------
// Fetchers (shared TMDB pool + write-through to the device cache)
// ---------------------------------------------------------------------------

export async function fetchCalendarTvSummary(
  showId: number,
  signal?: AbortSignal
): Promise<CalendarTvSummary> {
  const details = await enqueueTmdbBulkRequest(() => tmdbApi.getTVShowDetails(showId), signal);
  const summary = summarizeTvDetails(details);
  calendarEnrichmentCache.set(tvCacheKey(showId), summary);
  return summary;
}

export async function fetchCalendarSeasonSummary(
  showId: number,
  seasonNumber: number,
  signal?: AbortSignal
): Promise<CalendarSeasonSummary> {
  const season = await enqueueTmdbBulkRequest(
    () => tmdbApi.getSeasonDetails(showId, seasonNumber),
    signal
  );
  const summary: CalendarSeasonSummary = {
    k: 'season',
    episodes: (season.episodes || []).map((episode) => ({
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number,
      name: episode.name,
      airDate: episode.air_date ?? null,
    })),
  };
  calendarEnrichmentCache.set(seasonCacheKey(showId, seasonNumber), summary);
  return summary;
}

export async function fetchCalendarMovieSummary(
  movieId: number,
  region: string,
  signal?: AbortSignal
): Promise<CalendarMovieSummary> {
  const details = await enqueueTmdbBulkRequest(() => tmdbApi.getMovieDetails(movieId), signal);
  const summary = summarizeMovieDetails(details, region);
  calendarEnrichmentCache.set(movieCacheKey(movieId, region), summary);
  return summary;
}

// ---------------------------------------------------------------------------
// Freshness
// ---------------------------------------------------------------------------

const startOfTodayIso = () => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

export function getCalendarSummaryFreshTime(summary: CalendarSummary | undefined): number {
  if (summary?.k === 'tv' && FINISHED_STATUSES.includes(summary.status)) {
    return CALENDAR_SETTLED_FRESH_TIME_MS;
  }
  if (summary?.k === 'movie' && summary.releaseDate && summary.releaseDate < startOfTodayIso()) {
    return CALENDAR_SETTLED_FRESH_TIME_MS;
  }
  return CALENDAR_FRESH_TIME_MS;
}

const summaryStaleTime = (query: { state: { data?: CalendarSummary } }) =>
  getCalendarSummaryFreshTime(query.state.data);

// ---------------------------------------------------------------------------
// Query options (used by the calendar hook and by list-add prefetching)
// ---------------------------------------------------------------------------

function initialDataFromCache<T extends CalendarSummary>(cacheKey: string, kind: T['k']) {
  return {
    initialData: () => {
      const entry = calendarEnrichmentCache.get(cacheKey);
      return entry?.value.k === kind ? (entry.value as T) : undefined;
    },
    initialDataUpdatedAt: () => calendarEnrichmentCache.get(cacheKey)?.fetchedAt,
  };
}

export function calendarTvQueryOptions(showId: number, enabled = true) {
  return {
    queryKey: calendarTvQueryKey(showId),
    queryFn: ({ signal }: { signal: AbortSignal }) => fetchCalendarTvSummary(showId, signal),
    staleTime: summaryStaleTime,
    gcTime: CALENDAR_GC_TIME_MS,
    enabled,
    ...initialDataFromCache<CalendarTvSummary>(tvCacheKey(showId), 'tv'),
  };
}

export function calendarSeasonQueryOptions(showId: number, seasonNumber: number, enabled = true) {
  return {
    queryKey: calendarSeasonQueryKey(showId, seasonNumber),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchCalendarSeasonSummary(showId, seasonNumber, signal),
    staleTime: summaryStaleTime,
    gcTime: CALENDAR_GC_TIME_MS,
    enabled,
    ...initialDataFromCache<CalendarSeasonSummary>(seasonCacheKey(showId, seasonNumber), 'season'),
  };
}

export function calendarMovieQueryOptions(movieId: number, region: string, enabled = true) {
  return {
    queryKey: calendarMovieQueryKey(movieId, region),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchCalendarMovieSummary(movieId, region, signal),
    staleTime: summaryStaleTime,
    gcTime: CALENDAR_GC_TIME_MS,
    enabled,
    ...initialDataFromCache<CalendarMovieSummary>(movieCacheKey(movieId, region), 'movie'),
  };
}
