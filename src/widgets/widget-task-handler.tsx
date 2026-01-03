import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import {
  getUpcomingMovies,
  getUpcomingTVShows,
  getUserWatchlist,
} from '../services/widgetDataService';
import { UpcomingMoviesWidget } from './UpcomingMoviesWidget';
import { UpcomingTVWidget } from './UpcomingTVWidget';
import { WatchlistWidget } from './WatchlistWidget';

const widgetTaskHandler = async (props: WidgetTaskHandlerProps) => {
  const widgetId = props.widgetInfo.widgetId;

  // Get widget configuration from storage
  const configStr = await AsyncStorage.getItem(`widget_config_${widgetId}`);
  if (!configStr) return;

  const config = JSON.parse(configStr);
  const limit = config.size === 'small' ? 1 : config.size === 'medium' ? 3 : 5;

  switch (config.type) {
    case 'upcoming-movies': {
      const movies = await getUpcomingMovies(limit);
      return <UpcomingMoviesWidget items={movies} size={config.size} />;
    }

    case 'upcoming-tv': {
      const shows = await getUpcomingTVShows(limit);
      return <UpcomingTVWidget items={shows} size={config.size} />;
    }

    case 'watchlist': {
      if (!config.userId || !config.listId) return;
      const { items, listName } = await getUserWatchlist(config.userId, config.listId, limit);
      return <WatchlistWidget items={items} size={config.size} listName={listName} />;
    }

    default:
      return;
  }
};

export default widgetTaskHandler;
