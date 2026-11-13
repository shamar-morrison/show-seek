import { Reminder } from '@/src/types/reminder';
import { collapseSeasonsToShows } from '@/src/utils/listItemShows';
import { formatMonthYear } from '@/src/components/CustomDatePicker/utils';
import { isDefaultList } from '@/src/constants/lists';
import { useAuth } from '@/src/context/auth';
import { useRegion } from '@/src/context/RegionProvider';
import {
  CALENDAR_MOVIE_LOOKBACK_MS,
  calendarEnrichmentCache,
  calendarMovieQueryOptions,
  calendarSeasonQueryOptions,
  calendarTvQueryOptions,
  CalendarEpisode,
  CalendarMovieSummary,
  CalendarSeasonSummary,
  CalendarTvSummary,
  isCalendarEnrichmentQueryKey,
} from '@/src/services/calendarEnrichment';
import { ListMediaItem } from '@/src/services/ListService';
import { parseTmdbDate } from '@/src/utils/dateUtils';
import { useQueries, useQueryClient, UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLists } from './useLists';
import { useReminders } from './useReminders';

/**
 * Represents a single upcoming release item for the calendar
 */
export interface UpcomingRelease {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate: Date;
  /** For TV shows: episode info */
  nextEpisode?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeName?: string;
  };
  /** Whether this item is from reminders */
  isReminder: boolean;
  /** Source list IDs (e.g., 'watchlist', 'favorites') */
  sourceLists: string[];
  /** Unique key for this release (used for deduplication) */
  uniqueKey: string;
}

/**
 * Represents a section (month grouping) for the calendar
 */
export interface ReleaseSection {
  title: string; // e.g., "January 2026"
  data: UpcomingRelease[];
}

export interface UseUpcomingReleasesResult {
  sections: ReleaseSection[];
  allReleases: UpcomingRelease[];
  isLoading: boolean;
  isLoadingEnrichment: boolean;
  isEnrichmentFetching: boolean;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  error: Error | null;
}

// Maximum episodes to show per show
const MAX_EPISODES_PER_SHOW = 5;

// Default lists whose items appear on the calendar (custom lists are always included).
const TRACKED_DEFAULT_LIST_IDS = new Set(['watchlist', 'favorites', 'currently-watching']);

interface TrackedTitle {
  item: ListMediaItem;
  sourceLists: string[];
}

interface CombinedSummaries<K, T> {
  byKey: Map<K, T>;
  isLoading: boolean;
  isFetching: boolean;
  error: Error | null;
}

/**
 * Folds useQueries results into one value. Used as a stable `combine`, React Query
 * caches the output, so `byKey` keeps its identity until a result actually changes.
 * That keeps everything derived from it (releases, presentations, the list) from
 * rebuilding on unrelated re-renders such as opening search or a modal.
 */
function combineSummaries<K, T>(
  results: UseQueryResult<T>[],
  keys: readonly K[]
): CombinedSummaries<K, T> {
  const byKey = new Map<K, T>();
  let isLoading = false;
  let isFetching = false;
  let error: Error | null = null;

  results.forEach((result, index) => {
    if (result.data !== undefined && index < keys.length) {
      byKey.set(keys[index], result.data);
    }
    isLoading ||= result.isLoading;
    isFetching ||= result.isFetching;
    error ??= (result.error as Error | null) ?? null;
  });

  return { byKey, isLoading, isFetching, error };
}

function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  try {
    return parseTmdbDate(dateStr);
  } catch {
    return null;
  }
}

function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function toTvRelease(
  showId: number,
  title: string,
  posterPath: string | null,
  backdropPath: string | null,
  episode: CalendarEpisode,
  releaseDate: Date,
  sourceLists: string[]
): UpcomingRelease {
  return {
    id: showId,
    mediaType: 'tv',
    title,
    posterPath,
    backdropPath,
    releaseDate,
    nextEpisode: {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeName: episode.name,
    },
    isReminder: false,
    sourceLists,
    uniqueKey: `tv-${showId}-s${episode.seasonNumber}-e${episode.episodeNumber}`,
  };
}

/**
 * Hook that provides upcoming releases from user's tracked content
 * (Watchlist, Favorites, Watching, custom lists, and Reminders) for the Release Calendar.
 *
 * TV shows load a summary (status, next episode, which season to read) and then that
 * season's episodes (up to 5 upcoming per show). Movies load their region-specific
 * release date. Summaries are cached on device, so launches render immediately and
 * only stale titles refresh in the background.
 */
export function useUpcomingReleases(): UseUpcomingReleasesResult {
  const { user } = useAuth();
  const { region } = useRegion();
  const queryClient = useQueryClient();
  const userId = user && !user.isAnonymous ? user.uid : undefined;
  const { data: lists, isLoading: isLoadingLists } = useLists();
  const { data: reminders, isLoading: isLoadingReminders } = useReminders();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCacheReady, setIsCacheReady] = useState(() => calendarEnrichmentCache.isLoaded());

  const isAuthenticated = !!userId;

  useEffect(() => {
    if (isCacheReady) {
      return;
    }
    let isActive = true;
    void calendarEnrichmentCache.load().then(() => {
      if (isActive) {
        setIsCacheReady(true);
      }
    });
    return () => {
      isActive = false;
    };
  }, [isCacheReady]);

  // Write pending cache updates when leaving the calendar.
  useEffect(() => () => void calendarEnrichmentCache.flush(), []);

  // One entry per title, with every tracked list it appears in.
  const { trackedMovies, trackedShows } = useMemo(() => {
    const movies = new Map<number, TrackedTitle>();
    const shows = new Map<number, TrackedTitle>();
    if (!lists || !isAuthenticated) {
      return { trackedMovies: movies, trackedShows: shows };
    }

    lists.forEach((list) => {
      if (!TRACKED_DEFAULT_LIST_IDS.has(list.id) && isDefaultList(list.id)) {
        return;
      }
      // A listed season tracks its whole show, which appears once.
      collapseSeasonsToShows(Object.values(list.items || {})).forEach((item) => {
        const titles = item.media_type === 'movie' ? movies : shows;
        const existing = titles.get(item.id);
        if (!existing) {
          titles.set(item.id, { item, sourceLists: [list.id] });
        } else if (!existing.sourceLists.includes(list.id)) {
          existing.sourceLists.push(list.id);
        }
      });
    });

    return { trackedMovies: movies, trackedShows: shows };
  }, [lists, isAuthenticated]);

  const showIds = useMemo(() => Array.from(trackedShows.keys()), [trackedShows]);

  // Movies released over a year ago can't be upcoming in any region; skip them.
  const movieIds = useMemo(() => {
    const cutoff = getStartOfToday().getTime() - CALENDAR_MOVIE_LOOKBACK_MS;
    const ids: number[] = [];
    trackedMovies.forEach(({ item }, id) => {
      const listedDate = parseDate(item.release_date);
      if (!listedDate || listedDate.getTime() >= cutoff) {
        ids.push(id);
      }
    });
    return ids;
  }, [trackedMovies]);

  // Queries are only built once the device cache is loaded, so they pick it up
  // as initial data. Memoized so re-renders don't rebuild one config per title.
  const queriesEnabled = isAuthenticated && isCacheReady;

  const tvQueries = useMemo(
    () => (queriesEnabled ? showIds.map((id) => calendarTvQueryOptions(id)) : []),
    [queriesEnabled, showIds]
  );
  const combineTv = useCallback(
    (results: UseQueryResult<CalendarTvSummary>[]) => combineSummaries(results, showIds),
    [showIds]
  );
  const tv = useQueries({ queries: tvQueries, combine: combineTv });

  const movieQueries = useMemo(
    () => (queriesEnabled ? movieIds.map((id) => calendarMovieQueryOptions(id, region)) : []),
    [movieIds, queriesEnabled, region]
  );
  const combineMovies = useCallback(
    (results: UseQueryResult<CalendarMovieSummary>[]) => combineSummaries(results, movieIds),
    [movieIds]
  );
  const movies = useQueries({ queries: movieQueries, combine: combineMovies });

  // Seasons to load: one per show that can still have upcoming episodes.
  const seasonRequests = useMemo(() => {
    const requests: { showId: number; seasonNumber: number }[] = [];
    tv.byKey.forEach((summary, showId) => {
      if (summary.seasonToFetch !== null) {
        requests.push({ showId, seasonNumber: summary.seasonToFetch });
      }
    });
    return requests;
  }, [tv.byKey]);

  const seasonShowIds = useMemo(
    () => seasonRequests.map((request) => request.showId),
    [seasonRequests]
  );
  const seasonQueries = useMemo(
    () =>
      queriesEnabled
        ? seasonRequests.map(({ showId, seasonNumber }) =>
            calendarSeasonQueryOptions(showId, seasonNumber)
          )
        : [],
    [queriesEnabled, seasonRequests]
  );
  const combineSeasons = useCallback(
    (results: UseQueryResult<CalendarSeasonSummary>[]) => combineSummaries(results, seasonShowIds),
    [seasonShowIds]
  );
  const seasons = useQueries({ queries: seasonQueries, combine: combineSeasons });

  const isLoadingEnrichment = tv.isLoading || movies.isLoading || seasons.isLoading;
  // Unlike isLoadingEnrichment (query.isLoading === isPending && isFetching),
  // this stays true while an already-cached, stale query revalidates in the
  // background (status 'success', isFetching true, isLoading false). Consumers
  // use it to avoid treating "still revalidating" as "settled and empty".
  const isEnrichmentFetching =
    isLoadingEnrichment || tv.isFetching || movies.isFetching || seasons.isFetching;

  const allReleases = useMemo(() => {
    if (!isAuthenticated) return [];

    const today = getStartOfToday();
    const releasesByKey = new Map<string, UpcomingRelease>();

    trackedMovies.forEach(({ item, sourceLists }, id) => {
      const summary = movies.byKey.get(id);
      // Fall back to the list item's date when there is no regional date.
      const releaseDate = parseDate(summary?.releaseDate || item.release_date);
      if (!releaseDate || releaseDate < today) return;

      const uniqueKey = `movie-${id}`;
      releasesByKey.set(uniqueKey, {
        id,
        mediaType: 'movie',
        title: item.title,
        posterPath: item.poster_path,
        backdropPath: summary?.backdropPath ?? null,
        releaseDate,
        isReminder: false,
        sourceLists: [...sourceLists],
        uniqueKey,
      });
    });

    trackedShows.forEach(({ item, sourceLists }, showId) => {
      const summary = tv.byKey.get(showId);
      if (!summary) return;

      const title = summary.name;
      const backdropPath = summary.backdropPath;
      const season = seasons.byKey.get(showId);

      if (season) {
        let added = 0;
        for (const episode of season.episodes) {
          if (added >= MAX_EPISODES_PER_SHOW) break;
          const airDate = parseDate(episode.airDate);
          if (!airDate || airDate < today) continue;

          const release = toTvRelease(
            showId,
            title,
            item.poster_path,
            backdropPath,
            episode,
            airDate,
            [...sourceLists]
          );
          if (!releasesByKey.has(release.uniqueKey)) {
            releasesByKey.set(release.uniqueKey, release);
            added += 1;
          }
        }
        return;
      }

      // No season data yet: fall back to the show's next episode.
      const nextEpisode = summary.nextEpisode;
      const airDate = parseDate(nextEpisode?.airDate);
      if (!nextEpisode || !airDate || airDate < today) return;

      const release = toTvRelease(
        showId,
        item.name || item.title || title,
        item.poster_path,
        backdropPath,
        nextEpisode,
        airDate,
        [...sourceLists]
      );
      if (!releasesByKey.has(release.uniqueKey)) {
        releasesByKey.set(release.uniqueKey, release);
      }
    });

    reminders?.forEach((reminder: Reminder) => {
      const releaseDate = parseDate(reminder.releaseDate);
      if (!releaseDate || releaseDate < today || reminder.status !== 'active') return;

      const uniqueKey =
        reminder.mediaType === 'tv' && reminder.nextEpisode
          ? `tv-${reminder.mediaId}-s${reminder.nextEpisode.seasonNumber}-e${reminder.nextEpisode.episodeNumber}`
          : `${reminder.mediaType}-${reminder.mediaId}`;

      const existing = releasesByKey.get(uniqueKey);
      if (existing) {
        existing.isReminder = true;
        return;
      }

      releasesByKey.set(uniqueKey, {
        id: reminder.mediaId,
        mediaType: reminder.mediaType as 'movie' | 'tv',
        title: reminder.title,
        posterPath: reminder.posterPath,
        backdropPath: null,
        releaseDate,
        nextEpisode: reminder.nextEpisode
          ? {
              seasonNumber: reminder.nextEpisode.seasonNumber,
              episodeNumber: reminder.nextEpisode.episodeNumber,
              episodeName: reminder.nextEpisode.episodeName,
            }
          : undefined,
        isReminder: true,
        sourceLists: [],
        uniqueKey,
      });
    });

    return Array.from(releasesByKey.values()).sort(
      (a, b) => a.releaseDate.getTime() - b.releaseDate.getTime()
    );
  }, [
    isAuthenticated,
    movies.byKey,
    reminders,
    seasons.byKey,
    trackedMovies,
    trackedShows,
    tv.byKey,
  ]);

  // Group releases by month
  const sections = useMemo(() => {
    const sectionMap = new Map<string, UpcomingRelease[]>();

    allReleases.forEach((release) => {
      const monthKey = formatMonthYear(release.releaseDate);
      const section = sectionMap.get(monthKey);
      if (section) {
        section.push(release);
      } else {
        sectionMap.set(monthKey, [release]);
      }
    });

    return Array.from(sectionMap, ([title, data]) => ({ title, data }));
  }, [allReleases]);

  const isLoading =
    isLoadingLists || isLoadingReminders || (isAuthenticated && !isCacheReady);
  const error = tv.error || movies.error || seasons.error;

  const refresh = useCallback(async () => {
    if (!userId || isRefreshing) {
      return;
    }

    setIsRefreshing(true);

    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['lists', userId],
          refetchType: 'active',
        }),
        queryClient.invalidateQueries({
          queryKey: ['reminders', userId],
          refetchType: 'active',
        }),
      ]);

      await queryClient.invalidateQueries({
        predicate: (query) => isCalendarEnrichmentQueryKey(query.queryKey),
        refetchType: 'active',
      });
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, queryClient, userId]);

  return {
    sections,
    allReleases,
    isLoading,
    isLoadingEnrichment,
    isEnrichmentFetching,
    isRefreshing,
    refresh,
    error,
  };
}
