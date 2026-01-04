import * as QuickActions from 'expo-quick-actions';
import { useQuickActionRouting } from 'expo-quick-actions/router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Hook to handle Android Quick Actions (App Shortcuts).
 * This hook initializes the quick action routing and listens for incoming actions.
 */
export function useQuickActions() {
  // Use the library's router hook to handle deep linking automatically
  useQuickActionRouting();

  useEffect(() => {
    // Only run on Android
    if (Platform.OS !== 'android') return;

    // Static Android actions are not supported by the config plugin, so we set them here.
    // The keys for 'icon' match the keys defined in androidIcons in app.json
    QuickActions.setItems([
      {
        id: 'discover',
        title: 'Discover',
        subtitle: 'Browse movies and shows',
        icon: 'discover_icon',
        params: {
          href: '/(tabs)/discover',
        },
      },
      {
        id: 'search',
        title: 'Search',
        subtitle: 'Find content',
        icon: 'search_icon',
        params: {
          href: '/(tabs)/search',
        },
      },
      {
        id: 'library',
        title: 'Library',
        subtitle: 'Your collection',
        icon: 'library_icon',
        params: {
          href: '/(tabs)/library',
        },
      },
      {
        id: 'watchlist',
        title: 'Watchlist',
        subtitle: 'Your watchlist',
        icon: 'watchlist_icon',
        params: {
          href: '/(tabs)/library/watch-status',
        },
      },
    ]);
  }, []);
}
