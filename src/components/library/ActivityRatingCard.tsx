import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import type { ActivityItem } from '@/src/types/history';
import { listCardStyles } from '@/src/styles/listCardStyles';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface ActivityRatingCardProps {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
}

/**
 * Card component for displaying rated items in the history/stats screens.
 * Consistent with MovieRatingListCard and TVShowRatingListCard styling.
 */
export const ActivityRatingCard = memo<ActivityRatingCardProps>(({ item, onPress }) => {
  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

  // Extract year from release date if available
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;

  // Format subtitle based on media type
  let subtitle = '';
  if (item.mediaType === 'episode' && item.seasonNumber && item.episodeNumber) {
    subtitle = `S${item.seasonNumber} E${item.episodeNumber}`;
    if (item.tvShowName) {
      subtitle += ` • ${item.tvShowName}`;
    }
  } else if (item.mediaType === 'movie' && year) {
    subtitle = year.toString();
  } else if (item.mediaType === 'tv') {
    subtitle = year ? `TV Show • ${year}` : 'TV Show';
  }

  return (
    <Pressable
      style={({ pressed }) => [
        listCardStyles.container,
        styles.container,
        pressed && listCardStyles.containerPressed,
      ]}
      onPress={handlePress}
    >
      <MediaImage
        source={{ uri: getImageUrl(item.posterPath, TMDB_IMAGE_SIZES.poster.small) }}
        style={listCardStyles.poster}
        contentFit="cover"
      />
      <View style={listCardStyles.info}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
      {item.rating && <RatingBadge rating={item.rating} size="medium" />}
    </Pressable>
  );
});

ActivityRatingCard.displayName = 'ActivityRatingCard';

const styles = StyleSheet.create({
  container: {
    marginBottom: SPACING.m,
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
