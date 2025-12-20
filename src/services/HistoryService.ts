import { collection, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import type { TVShowEpisodeTracking, WatchedEpisode } from '../types/episodeTracking';
import type { ActivityItem, HistoryData, MonthlyDetail, MonthlyStats } from '../types/history';
import type { UserList } from './ListService';
import type { RatingItem } from './RatingService';

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
   * Fetch all episode tracking data for the user
   */
  private async fetchEpisodeTracking(): Promise<WatchedEpisode[]> {
    const user = auth.currentUser;
    if (!user) return [];

    try {
      const trackingRef = collection(db, 'users', user.uid, 'episode_tracking');
      const snapshot = await getDocs(trackingRef);

      const episodes: WatchedEpisode[] = [];
      snapshot.docs.forEach((doc) => {
        const data = doc.data() as TVShowEpisodeTracking;
        if (data.episodes) {
          Object.values(data.episodes).forEach((episode) => {
            episodes.push(episode);
          });
        }
      });

      return episodes;
    } catch (error) {
      console.error('[HistoryService] Error fetching episode tracking:', error);
      return [];
    }
  }

  /**
   * Fetch all ratings for the user
   */
  private async fetchRatings(): Promise<RatingItem[]> {
    const user = auth.currentUser;
    if (!user) return [];

    try {
      const ratingsRef = collection(db, 'users', user.uid, 'ratings');
      const snapshot = await getDocs(ratingsRef);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as RatingItem[];
    } catch (error) {
      console.error('[HistoryService] Error fetching ratings:', error);
      return [];
    }
  }

  /**
   * Fetch all lists for the user
   */
  private async fetchLists(): Promise<UserList[]> {
    const user = auth.currentUser;
    if (!user) return [];

    try {
      const listsRef = collection(db, 'users', user.uid, 'lists');
      const snapshot = await getDocs(listsRef);

      return snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as UserList[];
    } catch (error) {
      console.error('[HistoryService] Error fetching lists:', error);
      return [];
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

    // Get unique dates (day precision)
    const uniqueDates = [
      ...new Set(
        timestamps.map((ts) => {
          const date = new Date(ts);
          return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        })
      ),
    ].sort();

    if (uniqueDates.length === 0) {
      return { current: 0, longest: 0 };
    }

    // Calculate streaks
    let currentStreak = 1;
    let longestStreak = 1;
    let tempStreak = 1;

    for (let i = 1; i < uniqueDates.length; i++) {
      const prevDate = new Date(uniqueDates[i - 1]);
      const currDate = new Date(uniqueDates[i]);

      // Check if consecutive days
      const diffDays = Math.floor(
        (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (diffDays === 1) {
        tempStreak++;
        longestStreak = Math.max(longestStreak, tempStreak);
      } else {
        tempStreak = 1;
      }
    }

    // Check if current streak is active (includes today or yesterday)
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayStr = `${yesterday.getFullYear()}-${yesterday.getMonth()}-${yesterday.getDate()}`;

    const lastDate = uniqueDates[uniqueDates.length - 1];
    if (lastDate === todayStr || lastDate === yesterdayStr) {
      currentStreak = tempStreak;
    } else {
      currentStreak = 0;
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
    lists.forEach((list) => {
      if (list.items) {
        Object.values(list.items).forEach((item) => {
          if (item.addedAt && item.addedAt >= cutoffTimestamp) {
            listItems.push({
              timestamp: item.addedAt,
              genreIds: item.genre_ids,
              listName: list.name,
            });
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

        comparisonToPrevious = {
          watched: this.calculatePercentageChange(monthEpisodes.length, prevEpisodes.length),
          rated: this.calculatePercentageChange(monthRatings.length, prevRatings.length),
          addedToLists: this.calculatePercentageChange(monthListItems.length, prevListItems.length),
        };
      }

      return {
        month,
        monthName: this.formatMonthName(month),
        watched: monthEpisodes.length,
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
      totalWatched: recentEpisodes.length,
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
              });
            }
          }
        });
      }
    });

    // Convert to ActivityItems
    const watchedItems: ActivityItem[] = monthEpisodes.map((e) => ({
      id: e.episodeId,
      type: 'watched' as const,
      mediaType: 'episode' as const,
      title: e.episodeName,
      posterPath: null, // Not stored in episode tracking
      timestamp: e.watchedAt,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
    }));

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
