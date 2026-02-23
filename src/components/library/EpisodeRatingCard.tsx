import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { RatingItem } from '@/src/services/RatingService';
import { listCardStyles } from '@/src/styles/listCardStyles';
import React, { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface EpisodeRatingCardProps {
  rating: RatingItem;
  onPress: (rating: RatingItem) => void;
}

export const EpisodeRatingCard = memo<EpisodeRatingCardProps>(({ rating, onPress }) => {
  const { resolvePosterPath } = usePosterOverrides();
  const handlePress = useCallback(() => {
    onPress(rating);
  }, [onPress, rating]);

  if (rating.mediaType !== 'episode') {
    return null;
  }

  const episodeCode = `S${rating.seasonNumber}E${rating.episodeNumber}`;
  const posterPath = useMemo(
    () =>
      rating.tvShowId
        ? resolvePosterPath('tv', rating.tvShowId, rating.posterPath ?? null)
        : (rating.posterPath ?? null),
    [rating.posterPath, rating.tvShowId, resolvePosterPath]
  );

  return (
    <Pressable
      style={({ pressed }) => [
        listCardStyles.container,
        pressed && listCardStyles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small) }}
        style={listCardStyles.poster}
        contentFit="cover"
      />
      <View style={listCardStyles.info}>
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
