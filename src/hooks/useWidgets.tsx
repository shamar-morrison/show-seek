import { syncAllWidgetData } from '@/src/services/widgetDataService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState, NativeModules, Platform } from 'react-native';

export interface WidgetConfig {
  id: string;
  type: 'upcoming-movies' | 'upcoming-tv' | 'watchlist';
  listId?: string;
  userId?: string;
  size: 'small' | 'medium' | 'large';
  createdAt: number;
}

const WIDGETS_KEY = 'user_widgets';

// Native module for triggering widget updates
const WidgetUpdateModule = NativeModules.WidgetUpdate;

export function useWidgets(userId?: string) {
  const [widgets, setWidgets] = useState<WidgetConfig[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadWidgets();
    } else {
      setWidgets([]);
      setLoading(false);
    }
  }, [userId]);

  // Sync widget data when app becomes active
  useEffect(() => {
    if (!userId) return;

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        syncWidgetData();
      }
    });

    // Initial sync
    syncWidgetData();

    return () => {
      subscription.remove();
    };
  }, [userId, widgets]);

  async function loadWidgets() {
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
  }

  async function syncWidgetData() {
    // Find a watchlist widget to get the listId
    const watchlistWidget = widgets.find((w) => w.type === 'watchlist');
    const listId = watchlistWidget?.listId;

    await syncAllWidgetData(userId, listId, widgets);

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
    await syncWidgetData();

    return newWidget;
  }

  async function removeWidget(widgetId: string) {
    if (!userId) return;

    const updatedWidgets = widgets.filter((w) => w.id !== widgetId);
    setWidgets(updatedWidgets);
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));
    await AsyncStorage.removeItem(`widget_config_${widgetId}`);
  }

  const refreshAllWidgets = async () => {
    await syncWidgetData();
  };

  return {
    widgets,
    loading,
    addWidget,
    removeWidget,
    refreshAllWidgets,
  };
}
