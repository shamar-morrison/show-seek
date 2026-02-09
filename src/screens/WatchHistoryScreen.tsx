import { WatchHistoryList } from '@/src/components/WatchHistoryList';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { useDeleteWatch, useUpdateWatchDate, useWatchedMovies } from '@/src/hooks/useWatchedMovies';
import { screenStyles } from '@/src/styles/screenStyles';
import { Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

export default function WatchHistoryScreen() {
  const { t } = useTranslation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const movieId = Number(id);

  // Instances are already sorted descending by watchedAt in useWatchedMovies
  const { instances, isLoading } = useWatchedMovies(movieId);
  const deleteWatch = useDeleteWatch(movieId);
  const updateWatchDate = useUpdateWatchDate(movieId);

  // Format title as "Movie Title • Watch History"
  const headerTitle = title ? `${title} • ${t('watched.watchHistory')}` : t('watched.watchHistory');

  const handleDeleteInstance = useCallback(
    (instanceId: string) => {
      deleteWatch.mutate(instanceId);
    },
    [deleteWatch]
  );

  const handleEditInstance = useCallback(
    (instanceId: string, newDate: Date) => {
      updateWatchDate.mutate({ instanceId, newDate });
    },
    [updateWatchDate]
  );

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
      <WatchHistoryList
        instances={instances}
        isLoading={isLoading}
        onDeleteInstance={handleDeleteInstance}
        onEditInstance={handleEditInstance}
      />
    </View>
  );
}
