import { WatchHistoryList } from '@/src/components/WatchHistoryList';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { useWatchedMovies } from '@/src/hooks/useWatchedMovies';
import { screenStyles } from '@/src/styles/screenStyles';
import { Stack, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function WatchHistoryScreen() {
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const movieId = Number(id);

  // Instances are already sorted descending by watchedAt in useWatchedMovies
  const { instances, isLoading } = useWatchedMovies(movieId);

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
      <WatchHistoryList instances={instances} isLoading={isLoading} />
    </View>
  );
}
