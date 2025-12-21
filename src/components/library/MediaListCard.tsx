import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { ListMediaItem } from '@/src/services/ListService';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';

interface MediaListCardProps {
  item: ListMediaItem;
  onPress: (item: ListMediaItem) => void;
  onLongPress?: (item: ListMediaItem) => void;
  /** Optional subtitle to display below the title (e.g., character name or job) */
  subtitle?: string;
  /** Hide the media type label (Movie/TV Show) */
  hideMediaType?: boolean;
}

export const MediaListCard = memo<MediaListCardProps>(
  ({ item, onPress, onLongPress, subtitle, hideMediaType }) => {
    const handlePress = useCallback(() => {
      onPress(item);
    }, [onPress, item]);

    const handleLongPress = useCallback(() => {
      onLongPress?.(item);
    }, [onLongPress, item]);

    const year = item.release_date
      ? new Date(item.release_date).getFullYear()
      : item.first_air_date
        ? new Date(item.first_air_date).getFullYear()
        : null;

    return (
      <Pressable
        style={({ pressed }) => [styles.container, pressed && styles.containerPressed]}
        onPress={handlePress}
        onLongPress={handleLongPress}
      >
        <MediaImage
          source={{ uri: getImageUrl(item.poster_path, TMDB_IMAGE_SIZES.poster.small) }}
          style={styles.poster}
          contentFit="cover"
        />
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={2}>
            {item.title || item.name}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          <View style={styles.metaContainer}>
            {year && <Text style={styles.year}>{year}</Text>}
            {item.vote_average > 0 && year && <Text style={styles.separator}> • </Text>}
            {item.vote_average > 0 && (
              <View style={styles.tmdbRating}>
                <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
          {item.media_type && !hideMediaType && (
            <Text style={styles.mediaType}>
              {item.media_type === 'movie' ? 'Movie' : 'TV Show'}
            </Text>
          )}
        </View>
      </Pressable>
    );
  }
);

MediaListCard.displayName = 'MediaListCard';

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
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
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
  mediaType: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
