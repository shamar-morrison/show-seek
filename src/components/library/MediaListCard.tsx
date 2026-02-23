import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { listCardStyles } from '@/src/styles/listCardStyles';
import { metaTextStyles } from '@/src/styles/metaTextStyles';
import { ListMediaItem } from '@/src/services/ListService';
import { Star } from 'lucide-react-native';
import React, { memo, useCallback, useMemo } from 'react';
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
  /** Whether list is currently in multi-select mode */
  selectionMode?: boolean;
  /** Whether this item is selected in multi-select mode */
  isSelected?: boolean;
  movieLabel: string;
  tvShowLabel: string;
}

export const MediaListCard = memo<MediaListCardProps>(
  ({
    item,
    onPress,
    onLongPress,
    subtitle,
    hideMediaType,
    selectionMode = false,
    isSelected = false,
    movieLabel,
    tvShowLabel,
  }) => {
    const { accentColor } = useAccentColor();
    const { resolvePosterPath } = usePosterOverrides();
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
    const posterPath = useMemo(
      () => resolvePosterPath(item.media_type, item.id, item.poster_path),
      [item.id, item.media_type, item.poster_path, resolvePosterPath]
    );

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
            testID="media-list-card-selection-badge"
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
            {item.title || item.name}
          </Text>
          {subtitle && (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
          <View style={styles.metaContainer}>
            {year && <Text style={metaTextStyles.secondary}>{year}</Text>}
            {item.vote_average > 0 && year && <Text style={metaTextStyles.secondary}> • </Text>}
            {item.vote_average > 0 && (
              <View style={styles.tmdbRating}>
                <Star size={12} fill={COLORS.warning} color={COLORS.warning} />
                <Text style={styles.ratingText}>{item.vote_average.toFixed(1)}</Text>
              </View>
            )}
          </View>
          {item.media_type && !hideMediaType && (
            <Text style={styles.mediaType}>
              {item.media_type === 'movie' ? movieLabel : tvShowLabel}
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
  subtitle: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
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
  mediaType: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
