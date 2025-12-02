import { ACTIVE_OPACITY, COLORS, SPACING } from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { detailStyles } from './detailStyles';
import { getMediaTitle, getMediaYear } from './detailUtils';
import type { SimilarMediaSectionProps } from './types';

// Memoized media card component to prevent unnecessary re-renders
const SimilarMediaCard = memo<{
  item: any;
  onPress: (id: number) => void;
}>(({ item, onPress }) => {
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
      <MediaImage
        source={{
          uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small),
        }}
        style={detailStyles.similarPoster}
        contentFit="cover"
      />
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
  ({ mediaType, items, onMediaPress, title, style }) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <View style={style}>
        <Text style={[detailStyles.sectionTitle, { paddingBottom: SPACING.s }]}>{title}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={detailStyles.similarList}
        >
          {items.map((item) => (
            <SimilarMediaCard key={item.id} item={item} onPress={onMediaPress} />
          ))}
        </ScrollView>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // Custom comparison: check array length and first item ID
    return (
      prevProps.items.length === nextProps.items.length &&
      (prevProps.items.length === 0 || prevProps.items[0]?.id === nextProps.items[0]?.id) &&
      prevProps.title === nextProps.title
    );
  }
);

SimilarMediaSection.displayName = 'SimilarMediaSection';
