import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { getFirestoreErrorMessage } from '../firebase/firestore';
import type { TVShowEpisodeTracking, WatchedEpisode } from '../types/episodeTracking';
import type { ActivityItem, HistoryData, MonthlyDetail, MonthlyStats } from '../types/history';
import { createTimeoutWithCleanup } from '../utils/timeout';
import type { UserList } from './ListService';
import type { RatingItem } from './RatingService';

/** Episode with show metadata for history display */
interface EnrichedWatchedEpisode extends WatchedEpisode {
  tvShowName: string;
  posterPath: string | null;
}

/**
 * Time periods for grouping
 */
const TIME_OF_DAY = {
  MORNING: { start: 5, end: 12, label: 'Morning' },
  AFTERNOON: { start: 12, end: 17, label: 'Afternoon' },
  EVENING: { start: 17, end: 21, label: 'Evening' },
  NIGHT: { start: 21, end: 5, label: 'Night' },
} as const;

const DAYS_OF_WEEK = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

class HistoryService {
  /**
   * Format month string from timestamp
   */
  private formatMonth(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Format human-readable month name
   */
  private formatMonthName(monthKey: string): string {
    const [year, month] = monthKey.split('-').map(Number);
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  /**
   * Get timestamp for N months ago
   */
  private getMonthsAgoTimestamp(months: number): number {
    const date = new Date();
    date.setMonth(date.getMonth() - months);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Fetch all episode tracking data for the user, enriched with show metadata
   */
  private async fetchEpisodeTracking(): Promise<EnrichedWatchedEpisode[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const timeout = createTimeoutWithCleanup(10000, 'Episode tracking request timed out');

    try {
      const trackingRef = collection(db, 'users', user.uid, 'episode_tracking');
      const snapshot = await Promise.race([getDocs(trackingRef), timeout.promise]);

      const episodes: EnrichedWatchedEpisode[] = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as TVShowEpisodeTracking;
        if (data.episodes) {
          // Warn if metadata is missing - this indicates a partial write or data issue
          if (!data.metadata) {
            console.warn(
              `[HistoryService] Missing metadata for episode_tracking doc: ${doc.id}. Using fallback values.`
            );
          }

          // Use safe defaults when metadata is missing
          const tvShowName = data.metadata?.tvShowName ?? 'Unknown Show';
          const posterPath = data.metadata?.posterPath ?? null;

          Object.values(data.episodes).forEach((episode) => {
            episodes.push({
              ...episode,
              tvShowName,
              posterPath,
            });
          });
        }
      });

      return episodes;
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[HistoryService] Error fetching episode tracking:', message);
      return [];
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Fetch all ratings for the user
   */
  private async fetchRatings(): Promise<RatingItem[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const timeout = createTimeoutWithCleanup(10000, 'Ratings request timed out');

    try {
      const ratingsRef = collection(db, 'users', user.uid, 'ratings');
      const snapshot = await Promise.race([getDocs(ratingsRef), timeout.promise]);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RatingItem[];
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[HistoryService] Error fetching ratings:', message);
      return [];
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Fetch all lists for the user
   */
  private async fetchLists(): Promise<UserList[]> {
    const user = auth.currentUser;
    if (!user) return [];

    const timeout = createTimeoutWithCleanup(10000, 'Lists request timed out');

    try {
      const listsRef = collection(db, 'users', user.uid, 'lists');
      const snapshot = await Promise.race([getDocs(listsRef), timeout.promise]);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as UserList[];
    } catch (error) {
      const message = getFirestoreErrorMessage(error);
      console.error('[HistoryService] Error fetching lists:', message);
      return [];
    } finally {
      timeout.cancel();
    }
  }

  /**
   * Group items by month
   */
  private groupByMonth<T extends { timestamp: number }>(items: T[]): Map<string, T[]> {
    const grouped = new Map<string, T[]>();

    items.forEach((item) => {
      const monthKey = this.formatMonth(item.timestamp);
      const existing = grouped.get(monthKey) || [];
      existing.push(item);
      grouped.set(monthKey, existing);
    });

    return grouped;
  }

  /**
   * Calculate top genres from genre IDs
   */
  private calculateTopGenres(
    genreIdCounts: Map<number, number>,
    genreMap: Record<number, string>,
    limit = 3
  ): string[] {
    const sorted = [...genreIdCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);

    return sorted.map(([id]) => genreMap[id]).filter((name): name is string => !!name);
  }

  /**
   * Calculate streak from timestamps
   */
  private calculateStreaks(timestamps: number[]): { current: number; longest: number } {
    if (timestamps.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Helper to format date as YYYY-MM-DD (consistent, zero-padded format)
    const formatDateKey = (date: Date): string => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Get unique dates (day precision) as a Set for O(1) lookup
    const uniqueDateSet = new Set(timestamps.map((ts) => formatDateKey(new Date(ts))));

    // Sort dates for longest streak calculation
    const sortedDates = [...uniqueDateSet].sort();

    if (sortedDates.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Calculate longest streak by iterating through sorted dates
    let longestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const prevDate = new Date(sortedDates[i - 1]);
      const currDate = new Date(sortedDates[i]);

      // Check if consecutive days
      const diffMs = currDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    // Calculate current streak by working BACKWARDS from today
    const today = new Date();
    const todayStr = formatDateKey(today);
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = formatDateKey(yesterday);

    let currentStreak = 0;

    // Check if there's activity today or yesterday to start the streak
    if (uniqueDateSet.has(todayStr)) {
      currentStreak = 1;
      // Work backwards from yesterday
      let checkDate = new Date(today.getTime() - 24 * 60 * 60 * 1000);
      while (uniqueDateSet.has(formatDateKey(checkDate))) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      }
    } else if (uniqueDateSet.has(yesterdayStr)) {
      currentStreak = 1;
      // Work backwards from day before yesterday
      let checkDate = new Date(yesterday.getTime() - 24 * 60 * 60 * 1000);
      while (uniqueDateSet.has(formatDateKey(checkDate))) {
        currentStreak++;
        checkDate = new Date(checkDate.getTime() - 24 * 60 * 60 * 1000);
      }
    }

    return { current: currentStreak, longest: longestStreak };
  }

  /**
   * Analyze day and time patterns
   */
  private analyzePatterns(timestamps: number[]): {
    mostActiveDay: string | null;
    mostActiveTimeOfDay: string | null;
  } {
    if (timestamps.length === 0) {
      return { mostActiveDay: null, mostActiveTimeOfDay: null };
    }

    const dayCounts = new Map<number, number>();
    const timeCounts = new Map<string, number>();

    timestamps.forEach((ts) => {
      const date = new Date(ts);
      const day = date.getDay();
      const hour = date.getHours();

      // Count days
      dayCounts.set(day, (dayCounts.get(day) || 0) + 1);

      // Count time periods
      let period: string;
      if (hour >= TIME_OF_DAY.MORNING.start && hour < TIME_OF_DAY.MORNING.end) {
        period = TIME_OF_DAY.MORNING.label;
      } else if (hour >= TIME_OF_DAY.AFTERNOON.start && hour < TIME_OF_DAY.AFTERNOON.end) {
        period = TIME_OF_DAY.AFTERNOON.label;
      } else if (hour >= TIME_OF_DAY.EVENING.start && hour < TIME_OF_DAY.EVENING.end) {
        period = TIME_OF_DAY.EVENING.label;
      } else {
        period = TIME_OF_DAY.NIGHT.label;
      }
      timeCounts.set(period, (timeCounts.get(period) || 0) + 1);
    });

    // Find most active day
    let mostActiveDay: string | null = null;
    let maxDayCount = 0;
    dayCounts.forEach((count, day) => {
      if (count > maxDayCount) {
        maxDayCount = count;
        mostActiveDay = DAYS_OF_WEEK[day];
      }
    });

    // Find most active time
    let mostActiveTimeOfDay: string | null = null;
    let maxTimeCount = 0;
    timeCounts.forEach((count, period) => {
      if (count > maxTimeCount) {
        maxTimeCount = count;
        mostActiveTimeOfDay = period;
      }
    });

    return { mostActiveDay, mostActiveTimeOfDay };
  }

  /**
   * Calculate percentage change between two values
   */
  private calculatePercentageChange(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }

  /**
   * Fetch and aggregate user history data
   */
  async fetchUserHistory(genreMap: Record<number, string>, monthsBack = 6): Promise<HistoryData> {
    const cutoffTimestamp = this.getMonthsAgoTimestamp(monthsBack);

    // Fetch all data in parallel
    const [episodes, ratings, lists] = await Promise.all([
      this.fetchEpisodeTracking(),
      this.fetchRatings(),
      this.fetchLists(),
    ]);

    // Filter to recent period
    const recentEpisodes = episodes.filter((e) => e.watchedAt >= cutoffTimestamp);
    const recentRatings = ratings.filter((r) => r.ratedAt >= cutoffTimestamp);

    // Extract list items with addedAt timestamps
    const listItems: { timestamp: number; genreIds?: number[]; listName: string }[] = [];
    // Also track already-watched items separately for "watched" stats
    const alreadyWatchedItems: { timestamp: number }[] = [];

    lists.forEach((list) => {
      if (list.items) {
        Object.values(list.items).forEach((item) => {
          if (item.addedAt && item.addedAt >= cutoffTimestamp) {
            listItems.push({
              timestamp: item.addedAt,
              genreIds: item.genre_ids,
              listName: list.name,
            });
            // Track already-watched items for watched count
            if (list.id === 'already-watched') {
              alreadyWatchedItems.push({ timestamp: item.addedAt });
            }
          }
        });
      }
    });

    // Collect all timestamps for streak and pattern analysis
    const allTimestamps = [
      ...recentEpisodes.map((e) => e.watchedAt),
      ...recentRatings.map((r) => r.ratedAt),
      ...listItems.map((i) => i.timestamp),
    ];

    // Group by month
    const episodesByMonth = this.groupByMonth(
      recentEpisodes.map((e) => ({ ...e, timestamp: e.watchedAt }))
    );
    const ratingsByMonth = this.groupByMonth(
      recentRatings.map((r) => ({ ...r, timestamp: r.ratedAt }))
    );
    const listItemsByMonth = this.groupByMonth(listItems);
    const alreadyWatchedByMonth = this.groupByMonth(alreadyWatchedItems);

    // Get all months in the period
    const allMonths = new Set<string>();
    episodesByMonth.forEach((_, month) => allMonths.add(month));
    ratingsByMonth.forEach((_, month) => allMonths.add(month));
    listItemsByMonth.forEach((_, month) => allMonths.add(month));

    // Sort months (most recent first)
    const sortedMonths = [...allMonths].sort().reverse();

    // Calculate monthly stats
    const monthlyStats: MonthlyStats[] = sortedMonths.map((month, index) => {
      const monthEpisodes = episodesByMonth.get(month) || [];
      const monthRatings = ratingsByMonth.get(month) || [];
      const monthListItems = listItemsByMonth.get(month) || [];
      const monthAlreadyWatched = alreadyWatchedByMonth.get(month) || [];

      // Watched count = episodes + already-watched movies/TV
      const totalWatchedForMonth = monthEpisodes.length + monthAlreadyWatched.length;

      // Calculate average rating
      let averageRating: number | null = null;
      if (monthRatings.length > 0) {
        const sum = monthRatings.reduce((acc, r) => acc + r.rating, 0);
        averageRating = Math.round((sum / monthRatings.length) * 10) / 10;
      }

      // Calculate top genres for the month
      const genreIdCounts = new Map<number, number>();
      // Note: Episode tracking doesn't store genre_ids, so we only count from list items
      monthListItems.forEach((item) => {
        item.genreIds?.forEach((id) => {
          genreIdCounts.set(id, (genreIdCounts.get(id) || 0) + 1);
        });
      });
      const topGenres = this.calculateTopGenres(genreIdCounts, genreMap);

      // Calculate comparison to previous month
      let comparisonToPrevious: MonthlyStats['comparisonToPrevious'] = null;
      if (index < sortedMonths.length - 1) {
        const prevMonth = sortedMonths[index + 1];
        const prevEpisodes = episodesByMonth.get(prevMonth) || [];
        const prevRatings = ratingsByMonth.get(prevMonth) || [];
        const prevListItems = listItemsByMonth.get(prevMonth) || [];
        const prevAlreadyWatched = alreadyWatchedByMonth.get(prevMonth) || [];
        const prevTotalWatched = prevEpisodes.length + prevAlreadyWatched.length;

        comparisonToPrevious = {
          watched: this.calculatePercentageChange(totalWatchedForMonth, prevTotalWatched),
          rated: this.calculatePercentageChange(monthRatings.length, prevRatings.length),
          addedToLists: this.calculatePercentageChange(monthListItems.length, prevListItems.length),
        };
      }

      return {
        month,
        monthName: this.formatMonthName(month),
        watched: totalWatchedForMonth,
        rated: monthRatings.length,
        addedToLists: monthListItems.length,
        averageRating,
        topGenres,
        comparisonToPrevious,
      };
    });

    // Calculate streaks
    const { current: currentStreak, longest: longestStreak } = this.calculateStreaks(allTimestamps);

    // Analyze patterns
    const { mostActiveDay, mostActiveTimeOfDay } = this.analyzePatterns(allTimestamps);

    return {
      monthlyStats,
      currentStreak,
      longestStreak,
      mostActiveDay,
      mostActiveTimeOfDay,
      totalWatched: recentEpisodes.length + alreadyWatchedItems.length,
      totalRated: recentRatings.length,
      totalAddedToLists: listItems.length,
    };
  }

  /**
   * Fetch detailed data for a specific month
   */
  async fetchMonthDetail(
    month: string,
    genreMap: Record<number, string>
  ): Promise<MonthlyDetail | null> {
    const user = auth.currentUser;
    if (!user) return null;

    // Parse month to get date range
    const [year, monthNum] = month.split('-').map(Number);
    const startOfMonth = new Date(year, monthNum - 1, 1).getTime();
    const endOfMonth = new Date(year, monthNum, 0, 23, 59, 59, 999).getTime();

    // Fetch all data
    const [episodes, ratings, lists] = await Promise.all([
      this.fetchEpisodeTracking(),
      this.fetchRatings(),
      this.fetchLists(),
    ]);

    // Filter to this month
    const monthEpisodes = episodes.filter(
      (e) => e.watchedAt >= startOfMonth && e.watchedAt <= endOfMonth
    );
    const monthRatings = ratings.filter(
      (r) => r.ratedAt >= startOfMonth && r.ratedAt <= endOfMonth
    );

    // Get list items for this month - deduplicate by media ID + type
    const seenMedia = new Set<string>();
    const monthListItems: ActivityItem[] = [];
    lists.forEach((list) => {
      if (list.items) {
        Object.values(list.items).forEach((item) => {
          if (item.addedAt && item.addedAt >= startOfMonth && item.addedAt <= endOfMonth) {
            // Create a unique key for this media item
            const mediaKey = `${item.media_type}-${item.id}`;
            if (!seenMedia.has(mediaKey)) {
              seenMedia.add(mediaKey);
              monthListItems.push({
                id: item.id,
                type: 'added',
                mediaType: item.media_type,
                title: item.title || item.name || 'Unknown',
                posterPath: item.poster_path,
                timestamp: item.addedAt,
                listName: list.name,
                genreIds: item.genre_ids,
                releaseDate: item.release_date || item.first_air_date || null,
                voteAverage: item.vote_average,
              });
            }
          }
        });
      }
    });

    // Convert to ActivityItems - start with episodes (now enriched with show metadata)
    const watchedItems: ActivityItem[] = monthEpisodes.map((e) => ({
      id: e.episodeId,
      type: 'watched' as const,
      mediaType: 'episode' as const,
      title: e.episodeName,
      posterPath: e.posterPath,
      timestamp: e.watchedAt,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      tvShowId: e.tvShowId,
      tvShowName: e.tvShowName,
    }));

    // Also include movies and TV shows from the "already-watched" list
    const alreadyWatchedList = lists.find((l) => l.id === 'already-watched');
    if (alreadyWatchedList?.items) {
      Object.values(alreadyWatchedList.items).forEach((item) => {
        if (item.addedAt && item.addedAt >= startOfMonth && item.addedAt <= endOfMonth) {
          watchedItems.push({
            id: item.id,
            type: 'watched' as const,
            mediaType: item.media_type,
            title: item.title || item.name || 'Unknown',
            posterPath: item.poster_path,
            timestamp: item.addedAt,
            releaseDate: item.release_date || item.first_air_date || null,
            voteAverage: item.vote_average,
          });
        }
      });
    }

    const ratedItems: ActivityItem[] = monthRatings.map((r) => {
      // Extract the actual media ID from the rating document ID
      // Format: "movie-123" or "tv-456" or "episode-{tvShowId}-{season}-{episode}"
      let mediaId: number | string = r.id;
      if (r.mediaType === 'movie' && typeof r.id === 'string') {
        mediaId = parseInt(r.id.replace('movie-', ''), 10);
      } else if (r.mediaType === 'tv' && typeof r.id === 'string') {
        mediaId = parseInt(r.id.replace('tv-', ''), 10);
      } else if (r.mediaType === 'episode' && r.tvShowId) {
        // For episodes, use tvShowId for navigation
        mediaId = r.tvShowId;
      }

      return {
        id: mediaId,
        type: 'rated' as const,
        mediaType: r.mediaType,
        title: r.title || r.episodeName || r.tvShowName || 'Unknown',
        posterPath: r.posterPath || null,
        timestamp: r.ratedAt,
        rating: r.rating,
        releaseDate: r.releaseDate || null,
        seasonNumber: r.seasonNumber,
        episodeNumber: r.episodeNumber,
        tvShowName: r.tvShowName,
        tvShowId: r.tvShowId,
      };
    });

    // Sort all items by timestamp (most recent first)
    watchedItems.sort((a, b) => b.timestamp - a.timestamp);
    ratedItems.sort((a, b) => b.timestamp - a.timestamp);
    monthListItems.sort((a, b) => b.timestamp - a.timestamp);

    // Calculate stats for this month
    let averageRating: number | null = null;
    if (monthRatings.length > 0) {
      const sum = monthRatings.reduce((acc, r) => acc + r.rating, 0);
      averageRating = Math.round((sum / monthRatings.length) * 10) / 10;
    }

    // Calculate top genres
    const genreIdCounts = new Map<number, number>();
    monthListItems.forEach((item) => {
      item.genreIds?.forEach((id) => {
        genreIdCounts.set(id, (genreIdCounts.get(id) || 0) + 1);
      });
    });
    const topGenres = this.calculateTopGenres(genreIdCounts, genreMap);

    return {
      month,
      monthName: this.formatMonthName(month),
      stats: {
        month,
        monthName: this.formatMonthName(month),
        watched: watchedItems.length,
        rated: ratedItems.length,
        addedToLists: monthListItems.length,
        averageRating,
        topGenres,
        comparisonToPrevious: null,
      },
      items: {
        watched: watchedItems,
        rated: ratedItems,
        added: monthListItems,
      },
    };
  }
}

export const historyService = new HistoryService();
