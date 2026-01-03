import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';

export interface WidgetConfig {
  id: string;
  type: 'upcoming-movies' | 'upcoming-tv' | 'watchlist';
  listId?: string;
  userId?: string;
  size: 'small' | 'medium' | 'large';
  createdAt: number;
}

const WIDGETS_KEY = 'user_widgets';

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

    // Store widget configuration for the task handler to access by widgetId
    // Note: In real Android, widgetId is a number provided by the system.
    // For our internal management, we use the string 'id'.
    // The library mapping between system widgetId and our config will be handled in the task handler.
    // However, when the user adds a widget to the home screen, the system assigns an ID.
    // We need to map that ID to our configuration.
    // For now, we'll store specific configs that the task handler can look up.
    await AsyncStorage.setItem(`widget_config_${newWidget.id}`, JSON.stringify(newWidget));

    await refreshWidget(newWidget);

    return newWidget;
  }

  async function removeWidget(widgetId: string) {
    if (!userId) return;

    const updatedWidgets = widgets.filter((w) => w.id !== widgetId);
    setWidgets(updatedWidgets);
    await AsyncStorage.setItem(`${WIDGETS_KEY}_${userId}`, JSON.stringify(updatedWidgets));
    await AsyncStorage.removeItem(`widget_config_${widgetId}`);
  }

  async function refreshWidget(widget: WidgetConfig) {
    const widgetName =
      widget.type === 'upcoming-movies'
        ? 'UpcomingMoviesWidget'
        : widget.type === 'upcoming-tv'
          ? 'UpcomingTVWidget'
          : 'WatchlistWidget';

    try {
      await requestWidgetUpdate({
        widgetName,
        renderWidget: (props) => {
          return (<></>) as any;
        },
      });
    } catch (error) {
      console.error('Failed to update widget:', error);
    }
  }

  const refreshAllWidgets = async () => {
    for (const widget of widgets) {
      await refreshWidget(widget);
    }
  };

  return {
    widgets,
    loading,
    addWidget,
    removeWidget,
    refreshWidget,
    refreshAllWidgets,
  };
}
