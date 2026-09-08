import { getImageUrl, TMDB_IMAGE_SIZES } from '@/src/api/tmdb';
import { MediaImage } from '@/src/components/ui/MediaImage';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { formatTmdbDate } from '@/src/utils/dateUtils';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { ArrowRight01Icon } from '@hugeicons/core-free-icons';
import React, { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, TouchableOpacity, View, type ViewStyle } from 'react-native';
import type { UpNextEpisodeSectionProps } from './types';

/**
 * "Up Next" card showing the next episode to air for an ongoing show.
 * Rendered underneath the Seasons header; tapping navigates to the episode details screen.
 * The still thumbnail is omitted entirely when the episode has no still_path.
 */
export const UpNextEpisodeSection = memo<UpNextEpisodeSectionProps>(
  ({ episode, onEpisodePress, style }) => {
    const { t } = useTranslation();
    const { accentColor } = useAccentColor();

    const stillUrl = episode.still_path
      ? getImageUrl(episode.still_path, TMDB_IMAGE_SIZES.backdrop.small)
      : null;

    const subtitle = `${t('media.seasonEpisode', {
      season: episode.season_number,
      episode: episode.episode_number,
    })} • ${episode.air_date ? formatTmdbDate(episode.air_date) : t('common.tba')}`;

    const handlePress = useCallback(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onEpisodePress(episode.season_number, episode.episode_number);
    }, [episode.episode_number, episode.season_number, onEpisodePress]);

    return (
      <TouchableOpacity
        style={[styles.card, { borderColor: hexToRGBA(accentColor, 0.5) }, style]}
        onPress={handlePress}
        activeOpacity={ACTIVE_OPACITY}
        testID="up-next-episode-card"
        accessibilityRole="button"
        accessibilityLabel={`${t('media.upNext')}: ${episode.name}`}
      >
        {stillUrl ? (
          <MediaImage
            source={{ uri: stillUrl }}
            style={styles.still}
            contentFit="cover"
            placeholderType="tv"
          />
        ) : null}
        <View style={styles.info}>
          <Text style={[styles.upNextLabel, { color: accentColor }]}>{t('media.upNext')}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {episode.name}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <AppIcon
          icon={ArrowRight01Icon}
          size={17}
          color={COLORS.textSecondary}
          style={styles.chevron}
          testID="up-next-chevron"
        />
      </TouchableOpacity>
    );
  }
);

UpNextEpisodeSection.displayName = 'UpNextEpisodeSection';

const styles = StyleSheet.create({
  // Compact baseline scaled +5% (still 96x54 -> 101x57, spacing 8 -> 8.5, fonts 12/16 -> 12.5/17)
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    borderWidth: 1,
    padding: 8.5,
    gap: 8.5,
    marginBottom: SPACING.m,
  } as ViewStyle,
  still: {
    width: 101,
    height: 57,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surfaceLight,
  },
  info: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 2,
  },
  upNextLabel: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  title: {
    fontSize: 17,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12.5,
    color: COLORS.textSecondary,
  },
  chevron: {
    opacity: 0.6,
    flexShrink: 0,
  },
});
