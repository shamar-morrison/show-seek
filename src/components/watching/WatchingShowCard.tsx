import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useCurrentTab } from '@/src/context/TabContext';
import { InProgressShow } from '@/src/types/episodeTracking';
import { useRouter } from 'expo-router';
import { Play } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface WatchingShowCardProps {
  show: InProgressShow;
}

export const WatchingShowCard: React.FC<WatchingShowCardProps> = ({ show }) => {
  const router = useRouter();

  const currentTab = useCurrentTab();

  const handlePress = () => {
    // Navigate to show details
    router.push(`/(tabs)/${currentTab || 'library'}/tv/${show.tvShowId}` as any);
  };

  const getFormatTimeRemaining = (minutes: number) => {
    if (minutes < 60) return `${minutes}m left`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m left`;
  };

  return (
    <TouchableOpacity style={styles.container} onPress={handlePress} activeOpacity={0.7}>
      <MediaImage
        source={{ uri: getImageUrl(show.posterPath, TMDB_IMAGE_SIZES.poster.small) }}
        style={styles.poster}
      />

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {show.tvShowName}
          </Text>
          <Text style={styles.timeRemaining}>{getFormatTimeRemaining(show.timeRemaining)}</Text>
        </View>

        <View style={styles.episodeInfo}>
          <Text style={styles.episodeText} numberOfLines={1}>
            <Text style={styles.seasonEpLabel}>Next: </Text>
            {show.nextEpisode
              ? `S${show.nextEpisode.season}E${show.nextEpisode.episode}: ${show.nextEpisode.title}`
              : 'Caught up!'}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${show.percentage}%` }]} />
          </View>
          <Text style={styles.percentageText}>{show.percentage}%</Text>
        </View>
      </View>

      {!show.nextEpisode ? null : (
        <View style={styles.playIconContainer}>
          <Play size={16} color={COLORS.text} fill={COLORS.text} />
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    marginBottom: SPACING.m,
    padding: SPACING.s,
    alignItems: 'center',
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surface,
  },
  contentContainer: {
    flex: 1,
    marginLeft: SPACING.m,
    justifyContent: 'space-between',
    height: 80, // matches poster roughly minus padding
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  title: {
    fontSize: FONT_SIZE.m,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: SPACING.s,
  },
  timeRemaining: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
  },
  episodeInfo: {
    marginBottom: 6,
  },
  episodeText: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  seasonEpLabel: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: COLORS.secondary,
    borderRadius: 3,
    marginRight: SPACING.s,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: COLORS.primary,
    borderRadius: 3,
  },
  percentageText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    width: 32,
    textAlign: 'right',
  },
  playIconContainer: {
    marginLeft: SPACING.s,
    opacity: 0.8,
  },
});
