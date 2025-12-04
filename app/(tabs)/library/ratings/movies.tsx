import { BORDER_RADIUS, COLORS, SPACING } from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { useEnrichedMovieRatings } from '@/src/hooks/useEnrichedRatings';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter, useSegments } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { EnrichedMovieRating } from '@/src/hooks/useEnrichedRatings';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

export default function MovieRatingsScreen() {
  const router = useRouter();
  const segments = useSegments();
  const { data: enrichedRatings, isLoading } = useEnrichedMovieRatings();

  const sortedRatings = useMemo(() => {
    if (!enrichedRatings) return [];
    return [...enrichedRatings]
      .filter((r) => r.movie !== null)
      .sort((a, b) => b.rating.ratedAt - a.rating.ratedAt);
  }, [enrichedRatings]);

  const handleItemPress = useCallback(
    (movieId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const currentTab = segments[1];
      const basePath = currentTab ? `/(tabs)/${currentTab}` : '';
      router.push(`${basePath}/movie/${movieId}` as any);
    },
    [segments, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: EnrichedMovieRating }) => {
      if (!item.movie) return null;

      return (
        <Pressable
          style={({ pressed }) => [styles.mediaCard, pressed && styles.mediaCardPressed]}
          onPress={() => handleItemPress(item.movie!.id)}
        >
          <MediaImage
            source={{ uri: getImageUrl(item.movie.poster_path, TMDB_IMAGE_SIZES.poster.medium) }}
            style={styles.poster}
            contentFit="cover"
          />
          <View style={styles.ratingBadgeContainer}>
            <RatingBadge rating={item.rating.rating} size="medium" />
          </View>
        </Pressable>
      );
    },
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: EnrichedMovieRating) => item.rating.id, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (sortedRatings.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom']}>
        <EmptyState
          icon={Star}
          title="No Movie Ratings"
          description="Rate movies to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlashList
        data={sortedRatings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={ITEM_WIDTH * 1.5}
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
    marginLeft: SPACING.s,
  },
  mediaCard: {
    width: ITEM_WIDTH,
    marginBottom: SPACING.m,
    marginRight: SPACING.m,
  },
  mediaCardPressed: {
    transform: [{ scale: 0.95 }],
  },
  poster: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH * 1.5,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  ratingBadgeContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
});
