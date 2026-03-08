import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { EnrichedTVRating } from '@/src/hooks/useEnrichedRatings';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { metaTextStyles } from '@/src/styles/metaTextStyles';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface TVShowRatingListCardProps {
  item: EnrichedTVRating;
  onPress: (tvShowId: number) => void;
  onLongPress?: (item: EnrichedTVRating) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
}

export const TVShowRatingListCard = memo<TVShowRatingListCardProps>(
  ({ item, onPress, onLongPress, selectionMode = false, isSelected = false }) => {
    const { accentColor } = useAccentColor();
    const { resolvePosterPath } = usePosterOverrides();
    const handlePress = useCallback(() => {
      if (item.tvShow) {
        onPress(item.tvShow.id);
      }
    }, [onPress, item.tvShow]);
    const handleLongPress = useCallback(() => {
      onLongPress?.(item);
    }, [item, onLongPress]);

    const tvShow = item.tvShow;
    const tvShowId = tvShow?.id;
    const tvShowPosterPath = tvShow?.poster_path ?? null;
    const year = tvShow?.first_air_date ? new Date(tvShow.first_air_date).getFullYear() : null;
    const posterPath = useMemo(
      () => (tvShowId ? resolvePosterPath('tv', tvShowId, tvShowPosterPath) : null),
      [resolvePosterPath, tvShowId, tvShowPosterPath]
    );

    if (!tvShow) return null;

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          styles.container,
          pressed && listCardStyles.containerPressed,
          selectionMode && styles.selectionEnabledContainer,
          isSelected && { borderColor: accentColor, backgroundColor: COLORS.surfaceLight },
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        {selectionMode && (
          <View
            style={[
              styles.selectionBadge,
              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            testID="tv-rating-card-selection-badge"
          >
            <AnimatedCheck visible={isSelected} />
          </View>
        )}
        <MediaImage
          source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small) }}
          style={listCardStyles.poster}
          contentFit="cover"
        />
        <View style={listCardStyles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {tvShow.name}
          </Text>
          <View style={styles.metaContainer}>
            {year && <Text style={metaTextStyles.secondary}>{year}</Text>}
            {tvShow.vote_average > 0 && year && (
              <Text style={metaTextStyles.secondary}> • </Text>
            )}
            {tvShow.vote_average > 0 && (
              <View style={styles.tmdbRating}>
                <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={styles.ratingText}>{tvShow.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
        </View>
        <RatingBadge rating={item.rating.rating} size="medium" />
      </Pressable>
    );
  }
);
TVShowRatingListCard.displayName = 'TVShowRatingListCard';

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.m,
  },
  selectionEnabledContainer: {
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectionBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  metaContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tmdbRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  ratingText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    fontWeight: '600',
  },
});
