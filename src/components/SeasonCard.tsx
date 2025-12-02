import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/constants/theme';
import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import type { Season } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ProgressBar } from '@/src/components/ui/ProgressBar';
import { useShowEpisodeTracking } from '@/src/hooks/useEpisodeTracking';
import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface SeasonCardProps {
  tvShowId: number;
  season: Season;
  onPress: (seasonNumber: number) => void;
}

export const SeasonCard = memo<SeasonCardProps>(({ tvShowId, season, onPress }) => {
  const { data: episodeTracking } = useShowEpisodeTracking(tvShowId);

  // Calculate progress based on watched episodes for this season
  const progress = useMemo(() => {
    if (!episodeTracking?.episodes || season.episode_count === 0) {
      return null;
    }

    // Count watched episodes for this season
    const watchedCount = Object.keys(episodeTracking.episodes).filter((key) => {
      const [seasonNum] = key.split('_').map(Number);
      return seasonNum === season.season_number;
    }).length;

    // For now, use total episode count as aired count
    // (We can't determine unaired episodes without fetching full episode details)
    const percentage =
      season.episode_count > 0 ? (watchedCount / season.episode_count) * 100 : 0;

    return {
      watchedCount,
      totalCount: season.episode_count,
      percentage,
    };
  }, [episodeTracking, season.season_number, season.episode_count]);

  const handlePress = useCallback(() => {
    onPress(season.season_number);
  }, [season.season_number, onPress]);

  return (
    <TouchableOpacity style={styles.card} onPress={handlePress} activeOpacity={ACTIVE_OPACITY}>
      <MediaImage
        source={{
          uri: getImageUrl(season.poster_path, TMDB_IMAGE_SIZES.poster.small),
        }}
        style={styles.poster}
        contentFit="cover"
      />
      <Text style={styles.title} numberOfLines={1}>
        {season.name}
      </Text>
      <Text style={styles.episodeCount} numberOfLines={1}>
        {season.episode_count} {season.episode_count === 1 ? 'Episode' : 'Episodes'}
      </Text>
      {progress && progress.watchedCount > 0 && (
        <View style={styles.progressContainer}>
          <ProgressBar
            current={progress.watchedCount}
            total={progress.totalCount}
            height={4}
            showLabel={true}
          />
        </View>
      )}
    </TouchableOpacity>
  );
});

SeasonCard.displayName = 'SeasonCard';

const styles = StyleSheet.create({
  card: {
    width: 100,
    marginRight: SPACING.m,
  },
  poster: {
    width: 100,
    height: 150, // 2:3 aspect ratio
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
    marginBottom: 2,
  },
  episodeCount: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    marginBottom: SPACING.xs,
  },
  progressContainer: {
    marginTop: SPACING.xs,
  },
});
