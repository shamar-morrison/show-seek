import { tmdbApi } from '@/src/api/tmdb';
import { db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { writeToSharedPreferences } from './sharedPreferencesService';

const WIDGET_CACHE_PREFIX = 'widget_data_';
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

export interface WidgetMediaItem {
  id: number;
  title: string;
  posterPath: string;
  releaseDate: string;
  mediaType: 'movie' | 'tv';
}

export async function getUpcomingMovies(limitCount: number = 5): Promise<WidgetMediaItem[]> {
  const cacheKey = `${WIDGET_CACHE_PREFIX}upcoming_movies`;
  const cached = await getCachedData<WidgetMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await tmdbApi.getUpcomingMovies(1);
    const movies = data.results.slice(0, limitCount).map((m: any) => ({
      id: m.id,
      title: m.title,
      posterPath: m.poster_path,
      releaseDate: m.release_date,
      mediaType: 'movie' as const,
    }));

    await cacheData(cacheKey, movies);

    // Write to SharedPreferences for native widgets
    await writeToSharedPreferences('upcoming_movies', movies);

    return movies;
  } catch (error) {
    console.error('Failed to fetch upcoming movies for widget:', error);
    return [];
  }
}

export async function getUpcomingTVShows(limitCount: number = 5): Promise<WidgetMediaItem[]> {
  const cacheKey = `${WIDGET_CACHE_PREFIX}upcoming_tv`;
  const cached = await getCachedData<WidgetMediaItem[]>(cacheKey);
  if (cached) return cached;

  try {
    const data = await tmdbApi.getUpcomingTVShows(1);
    const shows = data.results.slice(0, limitCount).map((s: any) => ({
      id: s.id,
      title: s.name,
      posterPath: s.poster_path,
      releaseDate: s.first_air_date,
      mediaType: 'tv' as const,
    }));

    await cacheData(cacheKey, shows);

    // Write to SharedPreferences for native widgets
    await writeToSharedPreferences('upcoming_tv', shows);

    return shows;
  } catch (error) {
    console.error('Failed to fetch upcoming TV shows for widget:', error);
    return [];
  }
}

export async function getUserWatchlist(
  userId: string,
  listId: string,
  limitCount: number = 5
): Promise<{ items: WidgetMediaItem[]; listName: string }> {
  const cacheKey = `${WIDGET_CACHE_PREFIX}watchlist_${userId}_${listId}`;
  const cached = await getCachedData<{ items: WidgetMediaItem[]; listName: string }>(cacheKey);
  if (cached) return cached;

  try {
    const listRef = doc(db, 'users', userId, 'lists', listId);

    // Create a timeout promise to race against the Firestore call
    const { promise: timeoutPromise, cancel } = createTimeoutWithCleanup(
      10_000,
      'Firestore getDoc timed out'
    );

    // Race the getDoc call against the timeout
    const docSnap = await Promise.race([getDoc(listRef), timeoutPromise]).finally(() => cancel()); // Ensure we clear the timeout timer

    if (!docSnap.exists()) {
      return { items: [], listName: listId };
    }

    const data = docSnap.data();
    const listName = data.name || listId;
    const itemsMap = data.items || {};

    // Sort by addedAt descending and take the first few
    const items = Object.values(itemsMap)
      .sort((a: any, b: any) => (b.addedAt || 0) - (a.addedAt || 0))
      .slice(0, limitCount)
      .map((item: any) => ({
        id: item.id,
        title: item.title || item.name,
        posterPath: item.poster_path,
        releaseDate: item.release_date || item.first_air_date || '',
        mediaType: item.media_type,
      }));

    const result = { items, listName };
    await cacheData(cacheKey, result);

    // Write to SharedPreferences for native widgets
    await writeToSharedPreferences('watchlist', {
      items,
      listName,
      listId,
    });

    return result;
  } catch (error) {
    const errorMessage = getFirestoreErrorMessage(error);
    console.error('Failed to fetch user watchlist for widget:', errorMessage, error);
    return { items: [], listName: errorMessage };
  }
}

/**
 * Sync all widget data to SharedPreferences for native widgets
 */
export async function syncAllWidgetData(
  userId?: string,
  listId?: string,
  widgetConfigs?: Array<{ type: string; size: string; listId?: string }>
): Promise<void> {
  try {
    // Build widget config for native side
    const config: Record<string, string> = {};
    if (widgetConfigs) {
      for (const widget of widgetConfigs) {
        if (widget.type === 'upcoming-movies') {
          config.upcoming_movies_size = widget.size;
        } else if (widget.type === 'upcoming-tv') {
          config.upcoming_tv_size = widget.size;
        } else if (widget.type === 'watchlist') {
          config.watchlist_size = widget.size;
        }
      }
    }
    // Write widget config (sizes) to SharedPreferences
    await writeToSharedPreferences('widget_config', config);

    // Fetch and sync upcoming movies
    const movies = await getUpcomingMovies(5);
    await writeToSharedPreferences('upcoming_movies', movies);

    // Fetch and sync upcoming TV shows
    const tvShows = await getUpcomingTVShows(5);
    await writeToSharedPreferences('upcoming_tv', tvShows);

    // Sync watchlist if user is logged in
    if (userId && listId) {
      const watchlist = await getUserWatchlist(userId, listId, 5);
      // Include listName and listId for dynamic title and deep linking
      await writeToSharedPreferences('watchlist', {
        items: watchlist.items,
        listName: watchlist.listName,
        listId: listId,
      });
    }

    console.log('[Widget] Data synced to SharedPreferences');
  } catch (error) {
    console.error('[Widget] Failed to sync data:', error);
  }
}

async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const cached = await AsyncStorage.getItem(key);
    if (!cached) return null;

    const { data, timestamp } = JSON.parse(cached);
    if (Date.now() - timestamp > CACHE_DURATION) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

async function cacheData(key: string, data: any) {
  try {
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      })
    );
  } catch (error) {
    console.warn('Failed to cache widget data:', error);
  }
}
