import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { RatingItem } from '@/src/services/RatingService';
import { listCardStyles } from '@/src/styles/listCardStyles';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface SeasonRatingCardProps {
  rating: RatingItem;
  onPress: (rating: RatingItem) => void;
  onLongPress?: (rating: RatingItem) => void;
  selectionMode?: boolean;
  isSelected?: boolean;
}

export const SeasonRatingCard = memo<SeasonRatingCardProps>(
  ({ rating, onPress, onLongPress, selectionMode = false, isSelected = false }) => {
    const { accentColor } = useAccentColor();
    const { resolvePosterPath } = usePosterOverrides();
    const handlePress = useCallback(() => {
      onPress(rating);
    }, [onPress, rating]);
    const handleLongPress = useCallback(() => {
      onLongPress?.(rating);
    }, [onLongPress, rating]);

    const posterPath = useMemo(
      () =>
        rating.tvShowId
          ? resolvePosterPath('tv', rating.tvShowId, rating.posterPath ?? null)
          : (rating.posterPath ?? null),
      [rating.posterPath, rating.tvShowId, resolvePosterPath]
    );

    if (rating.mediaType !== 'season') {
      return null;
    }

    const seasonLabel = rating.title || `Season ${rating.seasonNumber ?? '?'}`;

    return (
      <Pressable
        style={({ pressed }) => [
          listCardStyles.container,
          pressed && listCardStyles.containerPressed,
          selectionMode && styles.selectionEnabledContainer,
          isSelected && { borderColor: accentColor, backgroundColor: COLORS.surfaceLight },
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        testID={`season-card-${rating.id}`}
      >
        {selectionMode && (
          <View
            style={[
              styles.selectionBadge,
              isSelected && { backgroundColor: accentColor, borderColor: accentColor },
            ]}
            testID="season-rating-card-selection-badge"
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
          <Text style={styles.tvShowName} numberOfLines={1}>
            {rating.tvShowName}
          </Text>
          <Text style={styles.seasonInfo} numberOfLines={1}>
            {seasonLabel}
          </Text>
        </View>
        <RatingBadge rating={rating.rating} size="medium" />
      </Pressable>
    );
  }
);
SeasonRatingCard.displayName = 'SeasonRatingCard';

const styles = StyleSheet.create({
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
  tvShowName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  seasonInfo: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
