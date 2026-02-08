import { WatchHistoryList } from '@/src/components/WatchHistoryList';
import { COLORS } from '@/src/constants/theme';
import { useWatchedMovies } from '@/src/hooks/useWatchedMovies';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import React, { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export default function WatchHistoryScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation();
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const movieId = Number(id);

  const { instances, isLoading } = useWatchedMovies(movieId);

  // Sort instances by date descending (most recent first)
  const sortedInstances = useMemo(() => {
    return [...instances].sort((a, b) => b.watchedAt.getTime() - a.watchedAt.getTime());
  }, [instances]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: title ? `${title} - ${t('watched.watchHistory')}` : t('watched.watchHistory'),
    });
  }, [navigation, t, title]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <WatchHistoryList instances={sortedInstances} isLoading={isLoading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
