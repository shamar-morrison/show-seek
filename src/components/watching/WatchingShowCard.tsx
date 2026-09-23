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
    if (show.isUnavailable) {
      return;
    }
    const tab = currentTab || 'library';
    if (show.nextEpisode?.kind === 'unwatched') {
      // Has unwatched aired episode → deep-link to that season
      router.push(`/(tabs)/${tab}/tv/${show.tvShowId}/seasons?season=${show.nextEpisode.season}` as any);
    } else if (show.nextEpisode?.kind === 'complete') {
      // Series complete → navigate to show detail page
      router.push(`/(tabs)/${tab}/tv/${show.tvShowId}` as any);
    } else {
      // Caught up (upcoming) or null → generic seasons screen
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
        style={[styles.poster, show.isUnavailable && { opacity: 0.6 }]}
      />

      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={1}>
            {show.tvShowName}
          </Text>
          {show.isUnavailable ? (
            <View style={styles.unavailableBadge} testID="watching-card-unavailable-badge">
              <Text style={styles.unavailableBadgeText}>Unavailable</Text>
            </View>
          ) : show.nextEpisode?.kind === 'unwatched' && show.timeRemaining > 0 ? (
            <Text style={styles.timeRemaining}>{getFormatTimeRemaining(show.timeRemaining)}</Text>
          ) : null}
        </View>

        <View style={styles.episodeInfo}>
          {show.isUnavailable ? (
            <Text style={styles.unavailableSubtext} numberOfLines={1}>
              Show details unavailable on TMDB
            </Text>
          ) : (
            <Text style={styles.episodeText} numberOfLines={1}>
              {show.nextEpisode?.kind === 'complete' ? (
                <Text style={styles.episodeText}>{t('watching.seriesComplete')}</Text>
              ) : (
                <>
                  <Text style={[styles.seasonEpLabel, { color: accentColor }]}>{t('watching.next')}</Text>{' '}
                  {show.nextEpisode?.kind === 'unwatched' || show.nextEpisode?.kind === 'upcoming'
                    ? show.nextEpisode.season > 0
                      ? t('watching.nextEpisode', {
                          seasonEpisode: t('media.seasonEpisode', {
                            season: show.nextEpisode.season,
                            episode: show.nextEpisode.episode,
                          }),
                          title: show.nextEpisode.title,
                        })
                      : show.nextEpisode.title || t('watching.caughtUp')
                    : t('watching.caughtUp')}
                </>
              )}
            </Text>
          )}
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

      {show.nextEpisode?.kind !== 'unwatched' || show.isUnavailable ? null : (
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
  unavailableBadge: {
    backgroundColor: COLORS.warningBackground,
    borderColor: COLORS.warningBorder,
    borderWidth: 1,
    borderRadius: BORDER_RADIUS.s,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unavailableBadgeText: {
    color: COLORS.warningText,
    fontSize: 10,
    fontFamily: FONT_FAMILY.medium,
  },
  unavailableSubtext: {
    fontSize: 12,
    color: COLORS.warningText,
    opacity: 0.8,
  },
});
