import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { EmptyState } from '@/src/components/library/EmptyState';
import { RatingBadge } from '@/src/components/library/RatingBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { EnrichedTVRating, useEnrichedTVRatings } from '@/src/hooks/useEnrichedRatings';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Star } from 'lucide-react-native';
import React, { useCallback, useMemo } from 'react';
import { ActivityIndicator, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');
const COLUMN_COUNT = 3;
const ITEM_WIDTH = (width - SPACING.l * 2 - SPACING.m * (COLUMN_COUNT - 1)) / COLUMN_COUNT;

export default function TVShowRatingsScreen() {
  const router = useRouter();
  const currentTab = useCurrentTab();
  const { data: enrichedRatings, isLoading } = useEnrichedTVRatings();

  const sortedRatings = useMemo(() => {
    if (!enrichedRatings) return [];
    return [...enrichedRatings]
      .filter((r) => r.tvShow !== null)
      .sort((a, b) => b.rating.ratedAt - a.rating.ratedAt);
  }, [enrichedRatings]);

  const handleItemPress = useCallback(
    (tvShowId: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const basePath = currentTab ? `/(tabs)/${currentTab}` : '';
      router.push(`${basePath}/tv/${tvShowId}` as any);
    },
    [currentTab, router]
  );

  const renderItem = useCallback(
    ({ item }: { item: EnrichedTVRating }) => {
      if (!item.tvShow) return null;

      return (
        <Pressable
          style={({ pressed }) => [styles.mediaCard, pressed && styles.mediaCardPressed]}
          onPress={() => handleItemPress(item.tvShow!.id)}
        >
          <MediaImage
            source={{
              uri: getImageUrl(item.tvShow.poster_path, TMDB_IMAGE_SIZES.poster.medium),
            }}
            style={styles.poster}
            contentFit="cover"
          />
          <View style={styles.ratingBadgeContainer}>
            <RatingBadge rating={item.rating.rating} size="medium" />
          </View>
          {item.tvShow && (
            <View style={styles.info}>
              <Text style={styles.title} numberOfLines={1}>
                {item.tvShow.name}
              </Text>
              {item.tvShow.first_air_date && (
                <View style={styles.yearRatingContainer}>
                  <Text style={styles.year}>
                    {new Date(item.tvShow.first_air_date).getFullYear()}
                  </Text>
                  {item.tvShow.vote_average > 0 && (
                    <>
                      <Text style={styles.separator}> • </Text>
                      <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
                      <Text style={styles.rating}>{item.tvShow.vote_average.toFixed(1)}</Text>
                    </>
                  )}
                </View>
              )}
            </View>
          )}
        </Pressable>
      );
    },
    [handleItemPress]
  );

  const keyExtractor = useCallback((item: EnrichedTVRating) => item.rating.id, []);

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
        <View style={styles.divider} />
        <EmptyState
          icon={Star}
          title="No TV Show Ratings"
          description="Rate TV shows to see them here."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.divider} />
      <FlashList
        data={sortedRatings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        numColumns={COLUMN_COUNT}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
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
    top: SPACING.xs,
    right: SPACING.xs,
  },
  info: {
    marginTop: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
  yearRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: SPACING.xs,
  },
  year: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  separator: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
  },
  rating: {
    color: COLORS.warning,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
  },
});
