import { WatchingEmptyState } from '@/src/components/watching/WatchingEmptyState';
import { WatchingShowCard } from '@/src/components/watching/WatchingShowCard';
import { COLORS } from '@/src/constants/theme';
import { useCurrentlyWatching } from '@/src/hooks/useCurrentlyWatching';
import { FlashList } from '@shopify/flash-list';
import { Stack } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

export default function WatchProgressScreen() {
  const { data, isLoading, error } = useCurrentlyWatching();

  const renderItem = ({ item }: { item: any }) => <WatchingShowCard show={item} />;

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerTitle: 'Watch Progress',
          headerBackTitle: 'Library',
          headerStyle: { backgroundColor: COLORS.background },
          headerTintColor: COLORS.text,
        }}
      />

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your watch history...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlashList
          data={data}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={WatchingEmptyState}
          keyExtractor={(item) => item.tvShowId.toString()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
});
