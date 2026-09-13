import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { AnimatedCheck } from '@/src/components/ui/AnimatedCheck';
import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { useCurrentTab } from '@/src/context/TabContext';
import { useLongPressPressGuard } from '@/src/hooks/useLongPressPressGuard';
import { usePosterOverrides } from '@/src/hooks/usePosterOverrides';
import { InProgressShow } from '@/src/types/episodeTracking';
import { useRouter } from 'expo-router';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { PlayIcon } from '@hugeicons/core-free-icons';
import React, { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface WatchingShowCardProps {
  show: InProgressShow;
  t: TFunction;
  /** Controlled press handler (selection toggle when in selection mode) */
  onPress?: (show: InProgressShow) => void;
  /** Long-press handler to enter multi-select mode */
  onLongPress?: (show: InProgressShow) => void;
  /** Whether the parent list is in multi-select mode */
  selectionMode?: boolean;
  /** Whether this card is selected */
  isSelected?: boolean;
}

export function WatchingShowCard({
  show,
  t,
  onPress,
  onLongPress,
  selectionMode = false,
  isSelected = false,
}: WatchingShowCardProps) {
  const router = useRouter();
  const { accentColor } = useAccentColor();
  const { resolvePosterPath } = usePosterOverrides();

  const currentTab = useCurrentTab();
  const posterPath = useMemo(
    () => resolvePosterPath('tv', show.tvShowId, show.posterPath),
    [resolvePosterPath, show.posterPath, show.tvShowId]
  );

  const handleDefaultPress = () => {
    const tab = currentTab || 'library';
    // Navigate to seasons screen, passing the next episode's season to auto-expand
    if (show.nextEpisode) {
      router.push(
        `/(tabs)/${tab}/tv/${show.tvShowId}/seasons?season=${show.nextEpisode.season}` as any
      );
    } else {
      // If caught up, just go to the seasons screen without a specific season
      router.push(`/(tabs)/${tab}/tv/${show.tvShowId}/seasons` as any);
    }
  };

  const handlePress = useCallback(() => {
    if (onPress) {
      onPress(show);
    } else {
      handleDefaultPress();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onPress, show]);

  const handleLongPress = useCallback(() => {
    onLongPress?.(show);
  }, [onLongPress, show]);

  const {
    handlePress: handleCardPress,
    handleLongPress: handleCardLongPress,
    handlePressOut,
  } = useLongPressPressGuard({
    onPress: handlePress,
    onLongPress: onLongPress ? handleLongPress : undefined,
  });

  const getFormatTimeRemaining = (minutes: number) => {
    if (minutes < 60) return t('watching.timeRemainingMinutes', { count: minutes });
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return t('watching.timeRemainingHours', { count: hours });
    return t('watching.timeRemainingHoursMinutes', { hours, minutes: mins });
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        selectionMode && styles.selectionEnabledContainer,
        isSelected && { borderColor: accentColor, backgroundColor: COLORS.surfaceLight },
      ]}
      onPress={handleCardPress}
      onPressOut={handlePressOut}
      onLongPress={onLongPress ? handleCardLongPress : undefined}
      delayLongPress={250}
      activeOpacity={ACTIVE_OPACITY}
      accessibilityLabel={show.tvShowName}
      accessibilityState={{ selected: isSelected }}
      testID={`watch-progress-card-${show.tvShowId}`}
    >
      {selectionMode && (
        <View
          style={[
            styles.selectionBadge,
            isSelected && { backgroundColor: accentColor, borderColor: accentColor },
          ]}
          testID="watch-progress-card-selection-badge"
        >
          <AnimatedCheck visible={isSelected} />
        </View>
      )}
      <MediaImage
        source={{ uri: getImageUrl(posterPath, TMDB_IMAGE_SIZES.poster.small) }}
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
            <Text style={[styles.seasonEpLabel, { color: accentColor }]}>{t('watching.next')}</Text>{' '}
            {show.nextEpisode
              ? t('watching.nextEpisode', {
                  seasonEpisode: t('media.seasonEpisode', {
                    season: show.nextEpisode.season,
                    episode: show.nextEpisode.episode,
                  }),
                  title: show.nextEpisode.title,
                })
              : t('watching.caughtUp')}
          </Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View
              style={[
                styles.progressBarFill,
                { width: `${show.percentage}%`, backgroundColor: accentColor },
              ]}
            />
          </View>
          <Text style={[styles.percentageText, { color: accentColor }]}>{show.percentage}%</Text>
        </View>
      </View>

      {!show.nextEpisode ? null : (
        <View style={styles.playIconContainer}>
          <AppIcon icon={PlayIcon} size={16} color={COLORS.text} fill={COLORS.text} />
        </View>
      )}
    </TouchableOpacity>
  );
}

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
  selectionBadge: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING.s,
  },
  selectionEnabledContainer: {
    borderWidth: 1,
    borderColor: 'transparent',
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
    fontFamily: FONT_FAMILY.bold,
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
    fontFamily: FONT_FAMILY.semiBold,
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
