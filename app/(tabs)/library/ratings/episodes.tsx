import { EmptyState } from '@/src/components/library/EmptyState';
import { EpisodeRatingCard } from '@/src/components/library/EpisodeRatingCard';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { useRatings } from '@/src/hooks/useRatings';
import { RatingItem } from '@/src/services/RatingService';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EpisodeRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: ratings, isLoading } = useRatings();

  const ItemSeparator = useCallback(() => <View style={styles.separator} />, []);

  const episodeRatings = useMemo(() => {
    if (!ratings) return [];
    return ratings.filter((r) => r.mediaType === 'episode').sort((a, b) => b.ratedAt - a.ratedAt);
  }, [ratings]);

  const handleItemPress = useCallback(
    (rating: RatingItem) => {
      if (rating.mediaType !== 'episode') return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!currentTab) {
        console.warn('Cannot navigate to episode: currentTab is null');
        return;
      }

      const path = `/(tabs)/${currentTab}/tv/${rating.tvShowId}/season/${rating.seasonNumber}/episode/${rating.episodeNumber}`;
      router.push(path as any);
    },
    [currentTab, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: RatingItem }) => (
      <EpisodeRatingCard rating={item} onPress={handleItemPress} />
    ),
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: RatingItem) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (episodeRatings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={Star}
          title="No Episode Ratings"
          description="Rate episodes to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlashList
        data={episodeRatings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={ItemSeparator}
      />
    </SafeAreaView>
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
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
  separator: {
    height: SPACING.m,
  },
});
