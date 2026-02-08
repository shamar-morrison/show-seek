import { WatchHistoryList } from '@/src/components/WatchHistoryList';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { useWatchedMovies } from '@/src/hooks/useWatchedMovies';
import { screenStyles } from '@/src/styles/screenStyles';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function WatchHistoryScreen() {
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const movieId = Number(id);

  const { instances, isLoading } = useWatchedMovies(movieId);

  // Sort instances by date descending (most recent first)
  const sortedInstances = useMemo(() => {
    return [...instances].sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
  }, [instances]);

  const headerTitle = title || t('watched.watchHistory');

  if (isLoading) {
    return (
      <View style={screenStyles.container}>
        <Stack.Screen options={{ title: headerTitle }} />
        <FullScreenLoading />
      </View>
    );
  }

  return (
    <View style={screenStyles.container}>
      <Stack.Screen options={{ title: headerTitle }} />
      <WatchHistoryList instances={sortedInstances} isLoading={isLoading} />
    </View>
  );
}
