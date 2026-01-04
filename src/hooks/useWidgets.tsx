import { syncAllWidgetData } from '@/src/services/widgetDataService';
import { WidgetConfig } from '@/src/types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';

const WIDGETS_KEY = 'user_widgets';

// Native module for triggering widget updates
const WidgetUpdateModule = NativeModules.WidgetUpdate;

export function useWidgets(userId?: string) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const widgetsRef = useRef(widgets);

  // Keep ref in sync
  useEffect(() => {
    widgetsRef.current = widgets;
  }, [widgets]);

  const loadWidgets = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(`${WIDGETS_KEY}_${userId}`);
      if (stored) {
        setWidgets(JSON.parse(stored));
      } else {
        setWidgets([]);
      }
    } catch (error) {
      console.error('Failed to load widgets:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadWidgets();
    } else {
      setWidgets([]);
      setLoading(false);
    }
  }, [userId, loadWidgets]);

  // Sync widget data when app becomes active
  useEffect(() => {
    if (!userId) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        syncWidgetData(widgetsRef.current);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [userId]);

  // Sync on local changes
  useEffect(() => {
    if (userId) {
      syncWidgetData(widgets);
    }
  }, [userId, widgets]);

  async function syncWidgetData(widgetsToSync: WidgetConfig[] = widgets) {
    // Find a watchlist widget to get the listId
    const watchlistWidget = widgetsToSync.find((w) => w.type === 'watchlist');
    const listId = watchlistWidget?.listId;

    await syncAllWidgetData(userId, listId, widgetsToSync);

    // Trigger native widget update
    if (Platform.OS === 'android' && WidgetUpdateModule) {
      try {
        await WidgetUpdateModule.updateAllWidgets();
      } catch (error) {
        console.log('Widget update module not available:', error);
      }
    }
  }

  async function addWidget(config: Omit<WidgetConfig, 'id' | 'createdAt' | 'userId'>) {
    if (!userId) return;

    const newWidget: WidgetConfig = {
      ...config,
      userId,
      id: `widget_${Date.now()}`,
      createdAt: Date.now(),
    };

    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));

    // Store widget configuration
    await AsyncStorage.setItem(`widget_config_${newWidget.id}`, JSON.stringify(newWidget));

    // Sync data for the new widget
    await syncWidgetData(updatedWidgets);

    return newWidget;
  }

  async function removeWidget(widgetId: string) {
    if (!userId) return;

    const updatedWidgets = widgets.filter((w) => w.id !== widgetId);
    setWidgets(updatedWidgets);
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));
    await AsyncStorage.removeItem(`widget_config_${widgetId}`);
    // Sync data after removal
    await syncWidgetData(updatedWidgets);
  }

  async function updateWidget(
    id: string,
    updates: Partial<Omit<WidgetConfig, 'id' | 'createdAt' | 'userId'>>
  ) {
    if (!userId) return;

    const updatedWidgets = widgets.map((w) => (w.id === id ? { ...w, ...updates } : w));
    setWidgets(updatedWidgets);
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));

    // Store widget configuration
    const updatedWidget = updatedWidgets.find((w) => w.id === id);
    if (updatedWidget) {
      await AsyncStorage.setItem(`widget_config_${id}`, JSON.stringify(updatedWidget));
    }

    // Sync data
    await syncWidgetData(updatedWidgets);
  }

  const reloadWidgets = useCallback(async () => {
    // Force reload from storage
    setLoading(true);
    await loadWidgets();
  }, [loadWidgets]);

  const refreshAllWidgets = async () => {
    await syncWidgetData(widgets);
  };

  return {
    widgets,
    loading,
    addWidget,
    updateWidget,
    removeWidget,
    refreshAllWidgets,
    reloadWidgets,
  };
}
