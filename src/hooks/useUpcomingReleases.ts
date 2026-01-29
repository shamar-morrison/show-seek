import { Episode, MovieDetails, tmdbApi, TVShowDetails } from '@/src/api/tmdb';
import { formatMonthYear } from '@/src/components/CustomDatePicker/utils';
import { useAuth } from '@/src/context/auth';
import { useRegion } from '@/src/context/RegionProvider';
import { ListMediaItem } from '@/src/services/ListService';
import { Reminder } from '@/src/types/reminder';
import { parseTmdbDate } from '@/src/utils/dateUtils';
import { getRegionalReleaseDate } from '@/src/utils/mediaUtils';
import { createRateLimitedQueryFn } from '@/src/utils/rateLimitedQuery';
import { useQueries } from '@tanstack/react-query';
import { useMemo } from 'react';
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
  error: Error | null;
}

// Stale time for details enrichment (30 minutes)
const DETAILS_STALE_TIME = 1000 * 60 * 30;
// Stale time for season details (15 minutes - shorter to catch new episodes)
const SEASON_DETAILS_STALE_TIME = 1000 * 60 * 15;
// Maximum episodes to show per show
const MAX_EPISODES_PER_SHOW = 5;

// Active statuses that indicate a show might have new episodes
const ACTIVE_STATUSES = ['Returning Series', 'In Production'];

/**
 * Extract unique TV show IDs from list items that need enrichment
 */
function extractTVShowIds(items: ListMediaItem[]): number[] {
  const tvIds = new Set<number>();
  items.forEach((item) => {
    if (item.media_type === 'tv') {
      tvIds.add(item.id);
    }
  });
  return Array.from(tvIds);
}

/**
 * Extract unique Movie IDs from list items that need enrichment
 */
function extractMovieIds(items: ListMediaItem[]): number[] {
  const movieIds = new Set<number>();
  items.forEach((item) => {
    if (item.media_type === 'movie') {
      movieIds.add(item.id);
    }
  });
  return Array.from(movieIds);
}

/**
 * Parse a date string safely, returning null if invalid.
 * Uses parseTmdbDate to ensure consistent local date parsing (avoids timezone shifts).
 */
function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  try {
    return parseTmdbDate(dateStr);
  } catch {
    return null;
  }
}

/**
 * Get the start of today (midnight) in local timezone
 */
function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Determine which season number to fetch for a TV show
 */
function getSeasonToFetch(details: TVShowDetails): number | null {
  // Priority 1: Use season from next_episode_to_air
  if (details.next_episode_to_air?.season_number) {
    return details.next_episode_to_air.season_number;
  }

  // Priority 2: For active shows, use the last season
  if (ACTIVE_STATUSES.includes(details.status) && details.seasons?.length > 0) {
    // Filter out specials (season 0) and get the highest season number
    const regularSeasons = details.seasons.filter((s) => s.season_number > 0);
    if (regularSeasons.length > 0) {
      return Math.max(...regularSeasons.map((s) => s.season_number));
    }
  }

  return null;
}

/**
 * Interface for season fetch request
 */
interface SeasonFetchRequest {
  showId: number;
  seasonNumber: number;
  showTitle: string;
  posterPath: string | null;
  backdropPath: string | null;
  sourceLists: string[];
}

/**
 * Hook that provides upcoming releases from user's tracked content
 * (Watchlist, Favorites, Watching, and Reminders) for the Release Calendar.
 *
 * For TV shows, fetches full season details to show all upcoming episodes
 * (up to 5 per show) instead of just the next episode.
 * 
 * For Movies, fetches full movie details to get region-specific release dates.
 */
export function useUpcomingReleases(): UseUpcomingReleasesResult {
  const { user } = useAuth();
  const { region } = useRegion();
  const { data: lists, isLoading: isLoadingLists } = useLists();
  const { data: reminders, isLoading: isLoadingReminders } = useReminders();

  const isGuest = !user || user.isAnonymous;

  // Extract items from watchlist, favorites, and watching lists
  const listItems = useMemo(() => {
    if (!lists || isGuest) return [];
    const items: (ListMediaItem & { sourceList: string })[] = [];

    // Include watchlist, favorites, and currently-watching (for ongoing series)
    const trackedListIds = ['watchlist', 'favorites', 'currently-watching'];

    lists.forEach((list) => {
      if (trackedListIds.includes(list.id)) {
        Object.values(list.items || {}).forEach((item) => {
          items.push({ ...item, sourceList: list.id });
        });
      }
    });

    return items;
  }, [lists, isGuest]);

  // Get IDs that need enrichment
  const tvShowIds = useMemo(() => extractTVShowIds(listItems), [listItems]);
  const movieIds = useMemo(() => extractMovieIds(listItems), [listItems]);

  // LEVEL 1a: Fetch TV show details in parallel
  const tvDetailsQueries = useQueries({
    queries: tvShowIds.map((id) => ({
      queryKey: ['tv', id, 'calendar-enrichment'],
      queryFn: createRateLimitedQueryFn(() => tmdbApi.getTVShowDetails(id)),
      staleTime: DETAILS_STALE_TIME,
      enabled: !isGuest && tvShowIds.length > 0,
    })),
  });

  // LEVEL 1b: Fetch Movie details in parallel (for region-specific dates)
  const movieDetailsQueries = useQueries({
    queries: movieIds.map((id) => ({
      queryKey: ['movie', id, 'calendar-enrichment'],
      queryFn: createRateLimitedQueryFn(() => tmdbApi.getMovieDetails(id)),
      staleTime: DETAILS_STALE_TIME,
      enabled: !isGuest && movieIds.length > 0,
    })),
  });

  // Create lookup maps
  const tvDetailsMap = useMemo(() => {
    const map = new Map<number, TVShowDetails>();
    tvDetailsQueries.forEach((query, index) => {
      if (query.data) {
        map.set(tvShowIds[index], query.data);
      }
    });
    return map;
  }, [tvDetailsQueries, tvShowIds]);

  const movieDetailsMap = useMemo(() => {
    const map = new Map<number, MovieDetails>();
    movieDetailsQueries.forEach((query, index) => {
      if (query.data) {
        map.set(movieIds[index], query.data);
      }
    });
    return map;
  }, [movieDetailsQueries, movieIds]);

  // Determine which seasons need to be fetched
  const seasonFetchRequests = useMemo(() => {
    const requests: SeasonFetchRequest[] = [];
    const seenShowIds = new Set<number>();

    listItems.forEach((item) => {
      if (item.media_type !== 'tv' || seenShowIds.has(item.id)) return;

      const details = tvDetailsMap.get(item.id);
      if (!details) return;

      const seasonNumber = getSeasonToFetch(details);
      if (seasonNumber === null) return;

      // Collect source lists for this show
      const sourceLists = listItems
        .filter((i) => i.id === item.id && i.media_type === 'tv')
        .map((i) => i.sourceList);

      requests.push({
        showId: item.id,
        seasonNumber,
        showTitle: details.name,
        posterPath: item.poster_path,
        backdropPath: details.backdrop_path,
        sourceLists: [...new Set(sourceLists)],
      });

      seenShowIds.add(item.id);
    });

    return requests;
  }, [listItems, tvDetailsMap]);

  // LEVEL 2: Fetch season details for shows that need episode data
  const seasonQueries = useQueries({
    queries: seasonFetchRequests.map(({ showId, seasonNumber }) => ({
      queryKey: ['tv', showId, 'season', seasonNumber, 'calendar'],
      queryFn: createRateLimitedQueryFn(() => tmdbApi.getSeasonDetails(showId, seasonNumber)),
      staleTime: SEASON_DETAILS_STALE_TIME,
      enabled: !isGuest && seasonFetchRequests.length > 0,
    })),
  });

  // Create a map of showId -> season data with episodes
  const seasonDataMap = useMemo(() => {
    const map = new Map<number, { episodes: Episode[]; request: SeasonFetchRequest }>();
    seasonQueries.forEach((query, index) => {
      if (query.data) {
        const request = seasonFetchRequests[index];
        map.set(request.showId, {
          episodes: query.data.episodes || [],
          request,
        });
      }
    });
    return map;
  }, [seasonQueries, seasonFetchRequests]);

  const isLoadingDetails = tvDetailsQueries.some((q) => q.isLoading) || movieDetailsQueries.some((q) => q.isLoading);
  const isLoadingSeasons = seasonQueries.some((q) => q.isLoading);
  const isLoadingEnrichment = isLoadingDetails || isLoadingSeasons;

  // Build the unified releases list
  const allReleases = useMemo(() => {
    if (isGuest) return [];

    const today = getStartOfToday();
    const releases: UpcomingRelease[] = [];
    const seenKeys = new Set<string>(); // To dedupe by unique key

    // Process movies from list items
    listItems.forEach((item) => {
      if (item.media_type !== 'movie') return;

      // Try to get region-specific date from enrichment details first
      const movieDetails = movieDetailsMap.get(item.id);
      const regionalDateStr = movieDetails ? getRegionalReleaseDate(movieDetails, region) : null;
      
      // Fallback to item date if regional unavailable
      const releaseDate = parseDate(regionalDateStr || item.release_date);

      if (!releaseDate || releaseDate < today) return;

      const uniqueKey = `movie-${item.id}`;
      const existingIndex = releases.findIndex((r) => r.uniqueKey === uniqueKey);

      if (existingIndex >= 0) {
        // Add to source lists if not already present
        if (!releases[existingIndex].sourceLists.includes(item.sourceList)) {
          releases[existingIndex].sourceLists.push(item.sourceList);
        }
      } else {
        releases.push({
          id: item.id,
          mediaType: 'movie',
          title: item.title,
          posterPath: item.poster_path,
          backdropPath: movieDetails?.backdrop_path || null,
          releaseDate,
          isReminder: false,
          sourceLists: [item.sourceList],
          uniqueKey,
        });
        seenKeys.add(uniqueKey);
      }
    });

    // Process TV shows with full season episode data
    seasonDataMap.forEach(({ episodes, request }) => {
      // Filter future episodes and limit to MAX_EPISODES_PER_SHOW
      const futureEpisodes = episodes
        .filter((ep) => {
          const airDate = parseDate(ep.air_date);
          return airDate && airDate >= today;
        })
        .slice(0, MAX_EPISODES_PER_SHOW);

      futureEpisodes.forEach((ep) => {
        const uniqueKey = `tv-${request.showId}-s${ep.season_number}-e${ep.episode_number}`;

        if (seenKeys.has(uniqueKey)) return;

        const releaseDate = parseDate(ep.air_date)!;

        releases.push({
          id: request.showId,
          mediaType: 'tv',
          title: request.showTitle,
          posterPath: request.posterPath,
          backdropPath: request.backdropPath,
          releaseDate,
          nextEpisode: {
            seasonNumber: ep.season_number,
            episodeNumber: ep.episode_number,
            episodeName: ep.name,
          },
          isReminder: false,
          sourceLists: request.sourceLists,
          uniqueKey,
        });
        seenKeys.add(uniqueKey);
      });
    });

    // Fallback: Process TV shows that don't have season data yet (use next_episode_to_air)
    listItems.forEach((item) => {
      if (item.media_type !== 'tv') return;

      // Skip if we already have season data for this show
      if (seasonDataMap.has(item.id)) return;

      const details = tvDetailsMap.get(item.id);
      const nextEp = details?.next_episode_to_air;
      if (!nextEp) return;

      const releaseDate = parseDate(nextEp.air_date);
      if (!releaseDate || releaseDate < today) return;

      const uniqueKey = `tv-${item.id}-s${nextEp.season_number}-e${nextEp.episode_number}`;
      if (seenKeys.has(uniqueKey)) return;

      releases.push({
        id: item.id,
        mediaType: 'tv',
        title: item.name || item.title,
        posterPath: item.poster_path,
        backdropPath: details?.backdrop_path || null,
        releaseDate,
        nextEpisode: {
          seasonNumber: nextEp.season_number,
          episodeNumber: nextEp.episode_number,
          episodeName: nextEp.name,
        },
        isReminder: false,
        sourceLists: [item.sourceList],
        uniqueKey,
      });
      seenKeys.add(uniqueKey);
    });

    // Process reminders
    reminders?.forEach((reminder: Reminder) => {
      const releaseDate = parseDate(reminder.releaseDate);
      if (!releaseDate || releaseDate < today || reminder.status !== 'active') return;

      // Generate unique key based on media type and episode info
      let uniqueKey: string;
      if (reminder.mediaType === 'tv' && reminder.nextEpisode) {
        uniqueKey = `tv-${reminder.mediaId}-s${reminder.nextEpisode.seasonNumber}-e${reminder.nextEpisode.episodeNumber}`;
      } else {
        uniqueKey = `${reminder.mediaType}-${reminder.mediaId}`;
      }

      const existingIndex = releases.findIndex((r) => r.uniqueKey === uniqueKey);

      if (existingIndex >= 0) {
        // Mark existing release as also being a reminder
        releases[existingIndex].isReminder = true;
      } else {
        releases.push({
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
      }
    });

    // Sort by release date ascending
    releases.sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime());

    return releases;
  }, [listItems, seasonDataMap, tvDetailsMap, movieDetailsMap, reminders, isGuest, region]);

  // Group releases by month
  const sections = useMemo(() => {
    const sectionMap = new Map<string, UpcomingRelease[]>();
    const comingSoon: UpcomingRelease[] = [];

    allReleases.forEach((release) => {
      const monthKey = formatMonthYear(release.releaseDate);
      if (!sectionMap.has(monthKey)) {
        sectionMap.set(monthKey, []);
      }
      sectionMap.get(monthKey)!.push(release);
    });

    // Convert map to array of sections
    const result: ReleaseSection[] = [];
    sectionMap.forEach((data, title) => {
      result.push({ title, data });
    });

    // Add "Coming Soon" section at the end if there are TBA items
    if (comingSoon.length > 0) {
      result.push({ title: 'Coming Soon', data: comingSoon });
    }

    return result;
  }, [allReleases]);

  const isLoading = isLoadingLists || isLoadingReminders;
  const detailsError = tvDetailsQueries.find((q) => q.error)?.error as Error | null;
  const movieDetailsError = movieDetailsQueries.find((q) => q.error)?.error as Error | null;
  const seasonError = seasonQueries.find((q) => q.error)?.error as Error | null;
  const error = detailsError || movieDetailsError || seasonError;

  return {
    sections,
    allReleases,
    isLoading,
    isLoadingEnrichment,
    error,
  };
}
