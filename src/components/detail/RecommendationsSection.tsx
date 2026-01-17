import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { FlashList } from '@shopify/flash-list';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import { getMediaTitle, getMediaYear } from './detailUtils';
import type { RecommendationsSectionProps } from './types';

// Memoized recommendation card component to prevent unnecessary re-renders
const RecommendationCard = memo<{
  item: any;
  onPress: (id: number) => void;
  mediaType: 'movie' | 'tv';
}>(({ item, onPress, mediaType }) => {
  const { getListsForMedia } = useListMembership();
  const listIds = getListsForMedia(item.id, mediaType);

  const year = useMemo(
    () => getMediaYear(item.release_date || item.first_air_date),
    [item.release_date, item.first_air_date]
  );

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  return (
    <TouchableOpacity
      style={detailStyles.similarCard}
      onPress={handlePress}
      activeOpacity={ACTIVE_OPACITY}
    >
      <View style={detailStyles.similarPosterContainer}>
        <MediaImage
          source={{
            uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small),
          }}
          style={detailStyles.similarPoster}
          contentFit="cover"
        />
        {listIds.length > 0 && <ListMembershipBadge listIds={listIds} />}
      </View>
      <Text style={detailStyles.similarTitle} numberOfLines={2}>
        {getMediaTitle(item)}
      </Text>
      <View style={detailStyles.similarMeta}>
        {year && <Text style={detailStyles.similarYear}>{year}</Text>}
        {item.vote_average > 0 && year && <Text style={detailStyles.similarSeparator}> • </Text>}
        {item.vote_average > 0 && (
          <View style={detailStyles.similarRating}>
            <Star size={10} fill={COLORS.warning} color={COLORS.warning} />
            <Text style={detailStyles.similarRatingText}>{item.vote_average.toFixed(1)}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
});

RecommendationCard.displayName = 'RecommendationCard';

export const RecommendationsSection = memo<RecommendationsSectionProps>(
  ({ items, isLoading, isError, shouldLoad, onMediaPress, onLayout, style, mediaType }) => {
    // Render loading skeleton
    if (isLoading && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>
            You May Also Like
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={detailStyles.similarList}
          >
            {[1, 2, 3].map((i) => (
              <View key={i} style={detailStyles.recommendationCardSkeleton}>
                <View style={detailStyles.skeletonPoster} />
                <View style={detailStyles.skeletonTitle} />
                <View style={detailStyles.skeletonMeta} />
              </View>
            ))}
          </ScrollView>
        </View>
      );
    }

    // Render error state
    if (isError && shouldLoad) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>
            You May Also Like
          </Text>
          <View style={detailStyles.reviewErrorBox}>
            <Text style={detailStyles.reviewErrorText}>Failed to load recommendations</Text>
          </View>
        </View>
      );
    }

    // Render recommendations if available
    if (!isLoading && !isError && items.length > 0) {
      return (
        <View style={style} onLayout={onLayout}>
          <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>
            You May Also Like
          </Text>
          <View style={detailStyles.similarList}>
            <FlashList
              horizontal
              data={items}
              keyExtractor={(item) => item.id.toString()}
              showsHorizontalScrollIndicator={false}
              removeClippedSubviews={true}
              drawDistance={400}
              renderItem={({ item }) => (
                <RecommendationCard item={item} onPress={onMediaPress} mediaType={mediaType} />
              )}
            />
          </View>
        </View>
      );
    }

    // Render trigger without content if not loaded yet
    if (!shouldLoad) {
      return <View style={style} onLayout={onLayout} />;
    }

    // Don't render anything if no recommendations
    return null;
  },
  (prevProps, nextProps) => {
    // Custom comparison: check items array length, loading states, and shouldLoad
    return (
      prevProps.isLoading === nextProps.isLoading &&
      prevProps.isError === nextProps.isError &&
      prevProps.shouldLoad === nextProps.shouldLoad &&
      prevProps.items.length === nextProps.items.length &&
      (prevProps.items.length === 0 || prevProps.items[0]?.id === nextProps.items[0]?.id)
    );
  }
);

RecommendationsSection.displayName = 'RecommendationsSection';
