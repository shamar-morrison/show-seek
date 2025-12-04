import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
} from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { RatingItem } from '@/src/services/RatingService';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface EpisodeRatingCardProps {
  rating: RatingItem;
  onPress: (rating: RatingItem) => void;
}

export const EpisodeRatingCard = memo<EpisodeRatingCardProps>(({ rating, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(rating);
  }, [onPress, rating]);

  if (rating.mediaType !== 'episode') {
    return null;
  }

  const episodeCode = `S${rating.seasonNumber}E${rating.episodeNumber}`;

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(rating.posterPath, TMDB_IMAGE_SIZES.poster.small) }}
        style={styles.poster}
        contentFit="cover"
      />
      <View style={styles.info}>
        <Text style={styles.tvShowName} numberOfLines={1}>
          {rating.tvShowName}
        </Text>
        <Text style={styles.episodeInfo} numberOfLines={1}>
          {episodeCode} • {rating.episodeName}
        </Text>
      </View>
      <RatingBadge rating={rating.rating} size="medium" />
    </Pressable>
  );
});

EpisodeRatingCard.displayName = 'EpisodeRatingCard';

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
  },
  containerPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.8,
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
  tvShowName: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  episodeInfo: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
