import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ListMembershipBadge } from '@/src/components/ui/ListMembershipBadge';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, COLORS, SPACING } from '@/src/constants/theme';
import { useListMembership } from '@/src/hooks/useListMembership';
import { FlashList } from '@shopify/flash-list';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import { getMediaTitle, getMediaYear } from './detailUtils';
import type { SimilarMediaItem, SimilarMediaSectionProps } from './types';

// Memoized media card component to prevent unnecessary re-renders
const SimilarMediaCard = memo<{
  item: any;
  onPress: (id: number) => void;
  onLongPress?: (item: any) => void;
  mediaType: 'movie' | 'tv';
}>(({ item, onPress, onLongPress, mediaType }) => {
  const { getListsForMedia } = useListMembership();
  const listIds = getListsForMedia(item.id, mediaType);

  const year = useMemo(
    () => getMediaYear(item.release_date || item.first_air_date),
    [item.release_date, item.first_air_date]
  );

  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(item);
  }, [item, onLongPress]);

  return (
    <TouchableOpacity
      style={detailStyles.similarCard}
      onPress={handlePress}
      onLongPress={handleLongPress}
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

SimilarMediaCard.displayName = 'SimilarMediaCard';

export const SimilarMediaSection = memo<SimilarMediaSectionProps>(
  ({ items, onMediaPress, onMediaLongPress, title, style, mediaType }) => {
    // Hook must be called unconditionally (before any early returns)
    const renderItem = useCallback(
      ({ item }: { item: SimilarMediaItem }) => (
        <SimilarMediaCard
          item={item}
          onPress={onMediaPress}
          onLongPress={onMediaLongPress}
          mediaType={mediaType}
        />
      ),
      [onMediaPress, onMediaLongPress, mediaType]
    );

    if (items.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>{title}</Text>
        <FlashList
          horizontal
          data={items}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: SPACING.l }}
          style={{ marginHorizontal: -SPACING.l }}
          removeClippedSubviews={true}
          drawDistance={400}
        />
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length, first item ID, and mediaType
    return (
      prevProps.items.length === nextProps.items.length &&
      (prevProps.items.length === 0 || prevProps.items[0]?.id === nextProps.items[0]?.id) &&
      prevProps.title === nextProps.title &&
      prevProps.mediaType === nextProps.mediaType
    );
  }
);

SimilarMediaSection.displayName = 'SimilarMediaSection';
