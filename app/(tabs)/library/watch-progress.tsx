import { WatchingEmptyState } from '@/src/components/watching/WatchingEmptyState';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';
import { FlashList } from '@shopify/flash-list';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WatchProgressScreen() {
  const { data, isLoading, error } = useCurrentlyWatching();

  const renderItem = ({ item }: { item: any }) => <WatchingShowCard show={item} />;

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading your watch history...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={data}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={WatchingEmptyState}
        keyExtractor={(item) => item.tvShowId.toString()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  listContent: {
    padding: SPACING.l,
    paddingBottom: SPACING.xl,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  loadingText: {
    marginTop: 16,
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: COLORS.background,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
});
