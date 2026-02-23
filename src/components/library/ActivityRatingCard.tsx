import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import type { ActivityItem } from '@/src/types/history';
import { listCardStyles } from '@/src/styles/listCardStyles';
import React, { memo, useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MediaImage } from '../ui/MediaImage';
import { RatingBadge } from './RatingBadge';

interface ActivityRatingCardProps {
  item: ActivityItem;
  onPress: (item: ActivityItem) => void;
  t: TFunction;
}

/**
 * Card component for displaying rated items in the history/stats screens.
 * Consistent with MovieRatingListCard and TVShowRatingListCard styling.
 */
export const ActivityRatingCard = memo<ActivityRatingCardProps>(({ item, onPress, t }) => {
  const { resolvePosterPath } = usePosterOverrides();

  const handlePress = useCallback(() => {
    onPress(item);
  }, [onPress, item]);

  const posterPath = useMemo(() => {
    if (item.mediaType === 'movie' || item.mediaType === 'tv') {
      const rawId = typeof item.id === 'number' ? item.id : Number(item.id);

      if (Number.isFinite(rawId)) {
        return resolvePosterPath(item.mediaType, rawId, item.posterPath);
      }
    }

    if (item.mediaType === 'episode' && item.tvShowId) {
      return resolvePosterPath('tv', item.tvShowId, item.posterPath);
    }

    return item.posterPath;
  }, [item.id, item.mediaType, item.posterPath, item.tvShowId, resolvePosterPath]);

  // Extract year from release date if available
  const year = item.releaseDate ? new Date(item.releaseDate).getFullYear() : null;

  // Format subtitle based on media type
  let subtitle = '';
  if (item.mediaType === 'episode' && item.seasonNumber && item.episodeNumber) {
    subtitle = t('media.seasonEpisode', { season: item.seasonNumber, episode: item.episodeNumber });
    if (item.tvShowName) {
      subtitle += ` • ${item.tvShowName}`;
    }
  } else if (item.mediaType === 'movie' && year) {
    subtitle = year.toString();
  } else if (item.mediaType === 'tv') {
    subtitle = year ? `${t('media.tvShow')} • ${year}` : t('media.tvShow');
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
        source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small) }}
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
