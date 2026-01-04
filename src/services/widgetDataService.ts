import { Movie, PaginatedResponse, tmdbApi, TVShow } from '@/src/api/tmdb';
import { db } from '@/src/firebase/config';
import { getFirestoreErrorMessage } from '@/src/firebase/firestore';
import { createTimeoutWithCleanup } from '@/src/utils/timeout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc } from 'firebase/firestore';
import { ListMediaItem } from './ListService';
import { writeToSharedPreferences } from './sharedPreferencesService';

const WIDGET_CACHE_PREFIX = 'widget_data_';
const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

async function setWidgetLoadingState(key: string, isLoading: boolean) {
  try {
    await writeToSharedPreferences(`${key}_loading`, isLoading);
  } catch (error) {
    console.warn(`Failed to set widget loading state for ${key}:`, error);
  }
}

export interface WidgetMediaItem {
  id: number;
  title: string;
  posterPath: string;
  releaseDate: string;
  mediaType: 'movie' | 'tv';
}

export async function getUpcomingMovies(limitCount: number = 5): Promise<WidgetMediaItem[]> {
  return fetchAndCacheWidgetData<Movie>(
    'upcoming_movies',
    'upcoming_movies',
    () => tmdbApi.getUpcomingMovies(1),
    'TMDB getUpcomingMovies timed out',
    (m) => ({
      id: m.id,
      title: m.title,
      posterPath: m.poster_path || '',
      releaseDate: m.release_date,
      mediaType: 'movie' as const,
    }),
    limitCount
  );
}

export async function getUpcomingTVShows(limitCount: number = 5): Promise<WidgetMediaItem[]> {
  return fetchAndCacheWidgetData<TVShow>(
    'upcoming_tv',
    'upcoming_tv',
    () => tmdbApi.getUpcomingTVShows(1),
    'TMDB getUpcomingTVShows timed out',
    (s) => ({
      id: s.id,
      title: s.name,
      posterPath: s.poster_path || '',
      releaseDate: s.first_air_date,
      mediaType: 'tv' as const,
    }),
    limitCount
  );
}

export async function getUserWatchlist(
  userId: string,
  listId: string,
  limitCount: number = 5
): Promise<{ items: WidgetMediaItem[]; listName: string }> {
  await setWidgetLoadingState('watchlist', true);
  const cacheKey = `${WIDGET_CACHE_PREFIX}watchlist_${userId}_${listId}`;
  const cached = await getCachedData<{ items: WidgetMediaItem[]; listName: string }>(cacheKey);
  if (cached) {
    await setWidgetLoadingState('watchlist', false);
    return cached;
  }

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
      await setWidgetLoadingState('watchlist', false);
      return { items: [], listName: listId };
    }

    const data = docSnap.data();
    const listName = data.name || listId;
    const itemsMap = (data.items || {}) as Record<string, ListMediaItem>;

    // Sort by addedAt descending and take the first few
    const items = Object.values(itemsMap)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
      .slice(0, limitCount)
      .map((item) => ({
        id: item.id,
        title: item.title || item.name || '',
        posterPath: item.poster_path || '',
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

    await setWidgetLoadingState('watchlist', false);
    return result;
  } catch (error) {
    await setWidgetLoadingState('watchlist', false);
    const errorMessage = getFirestoreErrorMessage(error);
    console.error('Failed to fetch user watchlist for widget:', errorMessage, error);
    return { items: [], listName: 'Unavailable' };
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
    await getUpcomingMovies(5);

    // Fetch and sync upcoming TV shows
    await getUpcomingTVShows(5);

    // Sync watchlist if user is logged in
    if (userId && listId) {
      await getUserWatchlist(userId, listId, 5);
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

async function fetchAndCacheWidgetData<T extends Movie | TVShow>(
  keySuffix: string,
  prefsKey: string,
  apiCall: () => Promise<PaginatedResponse<T>>,
  timeoutMsg: string,
  mapper: (item: T) => WidgetMediaItem,
  limitCount: number
): Promise<WidgetMediaItem[]> {
  const cacheKey = `${WIDGET_CACHE_PREFIX}${keySuffix}`;
  await setWidgetLoadingState(prefsKey, true);
  const cached = await getCachedData<WidgetMediaItem[]>(cacheKey);
  if (cached) {
    await setWidgetLoadingState(prefsKey, false);
    return cached;
  }

  try {
    // Create a timeout promise to race against the API call
    const { promise: timeoutPromise, cancel } = createTimeoutWithCleanup(10_000, timeoutMsg);

    const data = await Promise.race([apiCall(), timeoutPromise]).finally(() => cancel());
    const items = data.results.slice(0, limitCount).map(mapper);

    await cacheData(cacheKey, items);

    // Write to SharedPreferences for native widgets
    await writeToSharedPreferences(prefsKey, items);

    await setWidgetLoadingState(prefsKey, false);
    return items;
  } catch (error) {
    await setWidgetLoadingState(prefsKey, false);
    console.error(`Failed to fetch ${keySuffix} for widget:`, error);
    return [];
  }
}
