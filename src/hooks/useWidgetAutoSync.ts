import { listService } from '@/src/services/ListService';
import { syncAllWidgetData } from '@/src/services/widgetDataService';
import { WidgetConfig } from '@/src/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';

// Mirrors the storage key used by useWidgets for in-app widget configurations.
const WIDGETS_KEY = 'user_widgets';
// Default list backing the watchlist widget when the user has no in-app
// widget configuration (e.g. home-screen widgets added via the Android picker).
const DEFAULT_WATCHLIST_LIST_ID = 'watchlist';

// Native module for triggering widget updates (Android only).
const WidgetUpdateModule = NativeModules.WidgetUpdate;

async function loadStoredWidgetConfigs(userId: string | null): Promise<WidgetConfig[]> {
  if (!userId) {
    return [];
  }

  try {
    const stored = await AsyncStorage.getItem(`${WIDGETS_KEY}_${userId}`);
    if (!stored) {
      return [];
    }
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? (parsed as WidgetConfig[]) : [];
  } catch {
    return [];
  }
}

async function triggerNativeWidgetUpdate(): Promise<void> {
  if (Platform.OS !== 'android' || !WidgetUpdateModule) {
    return;
  }

  try {
    await WidgetUpdateModule.updateAllWidgets();
  } catch (error) {
    console.log('[WidgetAutoSync] Native widget update not available:', error);
  }
}

function hasItems(list: { items?: Record<string, unknown> }): boolean {
  return Object.keys(list.items ?? {}).length > 0;
}

/**
 * Resolve which list backs the watchlist widget. An explicitly configured
 * list always wins. Otherwise we must pick a list whose Firestore document
 * physically exists — DEFAULT_LISTS entries are merged client-side and their
 * docs often don't exist, in which case syncing them writes nothing and the
 * widget falls back to opening the library screen.
 */
async function resolveWatchlistListId(
  userId: string | null,
  configuredListId?: string
): Promise<string | undefined> {
  if (configuredListId) {
    return configuredListId;
  }
  if (!userId) {
    return undefined;
  }

  try {
    const lists = await listService.getUserLists(userId);
    const preferred =
      lists.find((l) => l.id === DEFAULT_WATCHLIST_LIST_ID && hasItems(l)) ??
      lists.find((l) => hasItems(l));
    return preferred?.id ?? DEFAULT_WATCHLIST_LIST_ID;
  } catch {
    return DEFAULT_WATCHLIST_LIST_ID;
  }
}

/**
 * Keeps native home-screen widget data in sync app-wide.
 *
 * Unlike useWidgets (mounted only under the Library widget settings screens),
 * this hook lives in the root layout so SharedPreferences stay populated no
 * matter how the user added their widgets — including straight from the
 * Android widget picker without ever opening the in-app settings.
 *
 * Syncs on mount, on auth-user change, and on every app foreground. All
 * fetches are cache-guarded (2h TTL) inside widgetDataService, so steady-state
 * cost is a few AsyncStorage reads plus idempotent preference writes.
 */
export function useWidgetAutoSync(userId?: string | null) {
  const userIdRef = useRef<string | null>(userId ?? null);
  userIdRef.current = userId ?? null;
  const syncInFlightRef = useRef(false);
  // Resolved list id per user, so foreground syncs don't re-read the lists
  // collection every time. Reset whenever the signed-in user changes.
  const resolvedListIdRef = useRef<{ uid: string | null; listId: string | undefined }>({
    uid: null,
    listId: undefined,
  });

  const runSync = async () => {
    if (syncInFlightRef.current) {
      return;
    }
    syncInFlightRef.current = true;

    try {
      const currentUserId = userIdRef.current;
      const configs = await loadStoredWidgetConfigs(currentUserId);
      const watchlistWidget = configs.find((w) => w.type === 'watchlist');

      let listId: string | undefined;
      const cached = resolvedListIdRef.current;
      if (watchlistWidget?.listId) {
        listId = watchlistWidget.listId;
      } else if (cached.uid === currentUserId) {
        listId = cached.listId;
      } else {
        listId = await resolveWatchlistListId(currentUserId, undefined);
        resolvedListIdRef.current = { uid: currentUserId, listId };
      }

      await syncAllWidgetData(currentUserId ?? undefined, listId, configs);
      await triggerNativeWidgetUpdate();
    } catch (error) {
      console.warn('[WidgetAutoSync] Failed to sync widget data:', error);
    } finally {
      syncInFlightRef.current = false;
    }
  };

  // Sync on mount and whenever the signed-in user changes (covers cold start
  // before auth resolves, then again once the uid is known).
  useEffect(() => {
    void runSync();
    // runSync is stable-by-ref (reads userId via ref); userId is the only input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Re-sync whenever the app comes to the foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void runSync();
      }
    });

    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
