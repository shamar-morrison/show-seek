import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { requestWidgetUpdate } from 'react-native-android-widget';

export function useWidgetUpdates() {
  useEffect(() => {
    const updateAll = async () => {
      try {
        await requestWidgetUpdate({
          widgetName: 'UpcomingMoviesWidget',
          renderWidget: () => (<></>) as any,
        });
        await requestWidgetUpdate({
          widgetName: 'UpcomingTVWidget',
          renderWidget: () => (<></>) as any,
        });
        await requestWidgetUpdate({
          widgetName: 'WatchlistWidget',
          renderWidget: () => (<></>) as any,
        });
      } catch (error) {
        console.log('Widget update failed (expected if no widgets pin):', error);
      }
    };

    // Update widgets when app comes to foreground
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        updateAll();
      }
    });

    // Initial update
    updateAll();

    // Set up periodic updates (every 2 hours)
    const interval = setInterval(
      () => {
        updateAll();
      },
      2 * 60 * 60 * 1000
    );

    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);
}
