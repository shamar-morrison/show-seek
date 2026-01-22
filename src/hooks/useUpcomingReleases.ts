import { tmdbApi, TVShowDetails } from '@/src/api/tmdb';
import { useAuth } from '@/src/context/auth';
import { ListMediaItem } from '@/src/services/ListService';
import { Reminder } from '@/src/types/reminder';
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
  /** For TV shows: next episode info */
  nextEpisode?: {
    seasonNumber: number;
    episodeNumber: number;
    episodeName?: string;
  };
  /** Whether this item is from reminders */
  isReminder: boolean;
  /** Source list IDs (e.g., 'watchlist', 'favorites') */
  sourceLists: string[];
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

// Stale time for TV show details enrichment (30 minutes, same as useForYouRecommendations)
const TV_DETAILS_STALE_TIME = 1000 * 60 * 30;

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
 * Parse a date string safely, returning null if invalid
 */
function parseDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr) return null;
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Get the start of today (midnight) in local timezone
 */
function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Format a date as month/year section title (e.g., "January 2026")
 */
function formatMonthYear(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Hook that provides upcoming releases from user's tracked content
 * (Watchlist, Favorites, Watching, and Reminders) for the Release Calendar.
 */
export function useUpcomingReleases(): UseUpcomingReleasesResult {
  const { user } = useAuth();
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

  // Get TV show IDs that need enrichment
  const tvShowIds = useMemo(() => extractTVShowIds(listItems), [listItems]);

  // Fetch TV show details in parallel to get next_episode_to_air
  const tvDetailsQueries = useQueries({
    queries: tvShowIds.map((id) => ({
      queryKey: ['tv', id, 'calendar-enrichment'],
      queryFn: () => tmdbApi.getTVShowDetails(id),
      staleTime: TV_DETAILS_STALE_TIME,
      enabled: !isGuest && tvShowIds.length > 0,
    })),
  });

  // Create a map of TV show ID -> details for quick lookup
  const tvDetailsMap = useMemo(() => {
    const map = new Map<number, TVShowDetails>();
    tvDetailsQueries.forEach((query, index) => {
      if (query.data) {
        map.set(tvShowIds[index], query.data);
      }
    });
    return map;
  }, [tvDetailsQueries, tvShowIds]);

  const isLoadingEnrichment = tvDetailsQueries.some((q) => q.isLoading);

  // Build the unified releases list
  const allReleases = useMemo(() => {
    if (isGuest) return [];

    const today = getStartOfToday();
    const releases: UpcomingRelease[] = [];
    const seenIds = new Set<string>(); // To dedupe by mediaType-id

    // Process list items (movies and TV shows)
    listItems.forEach((item) => {
      const key = `${item.media_type}-${item.id}`;
      const existingIndex = releases.findIndex((r) => `${r.mediaType}-${r.id}` === key);

      if (item.media_type === 'movie') {
        const releaseDate = parseDate(item.release_date);
        if (releaseDate && releaseDate >= today) {
          if (existingIndex >= 0) {
            // Add to source lists
            if (!releases[existingIndex].sourceLists.includes(item.sourceList)) {
              releases[existingIndex].sourceLists.push(item.sourceList);
            }
          } else {
            releases.push({
              id: item.id,
              mediaType: 'movie',
              title: item.title,
              posterPath: item.poster_path,
              backdropPath: null, // List items don't have backdrop
              releaseDate,
              isReminder: false,
              sourceLists: [item.sourceList],
            });
            seenIds.add(key);
          }
        }
      } else if (item.media_type === 'tv') {
        // Get enriched details for TV show
        const details = tvDetailsMap.get(item.id);
        const nextEp = details?.next_episode_to_air;
        const releaseDate = parseDate(nextEp?.air_date);

        if (releaseDate && releaseDate >= today) {
          if (existingIndex >= 0) {
            if (!releases[existingIndex].sourceLists.includes(item.sourceList)) {
              releases[existingIndex].sourceLists.push(item.sourceList);
            }
          } else {
            releases.push({
              id: item.id,
              mediaType: 'tv',
              title: item.name || item.title,
              posterPath: item.poster_path,
              backdropPath: details?.backdrop_path || null,
              releaseDate,
              nextEpisode: nextEp
                ? {
                    seasonNumber: nextEp.season_number,
                    episodeNumber: nextEp.episode_number,
                    episodeName: nextEp.name,
                  }
                : undefined,
              isReminder: false,
              sourceLists: [item.sourceList],
            });
            seenIds.add(key);
          }
        }
      }
    });

    // Process reminders
    reminders?.forEach((reminder: Reminder) => {
      const key = `${reminder.mediaType}-${reminder.mediaId}`;
      const releaseDate = parseDate(reminder.releaseDate);

      if (releaseDate && releaseDate >= today && reminder.status === 'active') {
        const existingIndex = releases.findIndex((r) => `${r.mediaType}-${r.id}` === key);

        if (existingIndex >= 0) {
          // Mark as also being a reminder
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
          });
        }
      }
    });

    // Sort by release date ascending
    releases.sort((a, b) => a.releaseDate.getTime() - b.releaseDate.getTime());

    return releases;
  }, [listItems, tvDetailsMap, reminders, isGuest]);

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
  const error = tvDetailsQueries.find((q) => q.error)?.error as Error | null;

  return {
    sections,
    allReleases,
    isLoading,
    isLoadingEnrichment,
    error,
  };
}
