import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { EnrichedTVRating } from '@/src/hooks/useEnrichedRatings';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface TVShowRatingListCardProps {
  item: EnrichedTVRating;
  onPress: (tvShowId: number) => void;
}

export const TVShowRatingListCard = memo<TVShowRatingListCardProps>(({ item, onPress }) => {
  const handlePress = useCallback(() => {
    if (item.tvShow) {
      onPress(item.tvShow.id);
    }
  }, [onPress, item.tvShow]);

  if (!item.tvShow) return null;

  const year = item.tvShow.first_air_date
    ? new Date(item.tvShow.first_air_date).getFullYear()
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.tvShow.poster_path, TMDB_IMAGE_SIZES.poster.small) }}
        style={styles.poster}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.tvShow.name}
        </Text>
        <View style={styles.metaContainer}>
          {year && <Text style={styles.year}>{year}</Text>}
          {item.tvShow.vote_average > 0 && year && <Text style={styles.separator}> • </Text>}
          {item.tvShow.vote_average > 0 && (
            <View style={styles.tmdbRating}>
              <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
              <Text style={styles.ratingText}>{item.tvShow.vote_average.toFixed(1)}</Text>
            </View>
          )}
        </View>
      </View>
      <RatingBadge rating={item.rating.rating} size="medium" />
    </Pressable>
  );
});

TVShowRatingListCard.displayName = 'TVShowRatingListCard';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
    marginBottom: SPACING.m,
  },
  containerPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  info: {
    flex: 1,
    gap: SPACING.xs,
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
  year: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
  separator: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
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
