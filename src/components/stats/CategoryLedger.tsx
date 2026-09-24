import { AppIcon } from '@/src/components/ui/AppIcon';
import { COLORS, FONT_FAMILY, FONT_SIZE, SPACING } from '@/src/constants/theme';
import type { MediaSplit } from '@/src/types/history';
import type { IconSvgElement } from '@hugeicons/react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface CategoryLedgerProps {
  icon: IconSvgElement;
  iconColor: string;
  title: string;
  total: number | string;
  split: MediaSplit;
  compact?: boolean;
  testID?: string;
}

/**
 * Ledger block for a single stat category (Watched / Rated / Added).
 *
 * Replaces the old side-by-side stat cards: a header row carries the icon,
 * category title, and headline total, then hairline separators divide the
 * Movies and TV Shows breakdown rows. Episode detail (e.g. "1,000 episodes")
 * renders under the TV Shows label only when nonzero (watched episode plays
 * and episode-level ratings; always 0 for added).
 */
export function CategoryLedger({
  icon,
  iconColor,
  title,
  total,
  split,
  compact = false,
  testID,
}: CategoryLedgerProps) {
  const { t } = useTranslation();

  return (
    <View testID={testID} accessibilityRole="summary" accessibilityLabel={`${title}: ${total}`}>
      <View style={styles.headerRow}>
        <AppIcon icon={icon} size={compact ? 18 : 20} color={iconColor} />
        <Text style={[styles.title, compact && styles.titleCompact]}>{title}</Text>
        <Text style={[styles.total, compact && styles.totalCompact]}>{total}</Text>
      </View>

      <View style={styles.divider} />

      <View style={[styles.splitRow, compact && styles.splitRowCompact]}>
        <Text style={[styles.splitLabel, compact && styles.splitLabelCompact]}>
          {t('media.movies')}
        </Text>
        <Text style={[styles.splitValue, compact && styles.splitValueCompact]}>
          {split.movies}
        </Text>
      </View>

      <View style={styles.hairline} />

      <View style={[styles.splitRow, compact && styles.splitRowCompact]}>
        <View style={styles.tvLabelColumn}>
          <Text style={[styles.splitLabel, compact && styles.splitLabelCompact]}>
            {t('media.tvShows')}
          </Text>
          {split.tvEpisodes > 0 && (
            <Text style={styles.episodeDetail}>
              {t('media.numberOfEpisodes', { count: split.tvEpisodes })}
            </Text>
          )}
        </View>
        <Text style={[styles.splitValue, compact && styles.splitValueCompact]}>
          {split.tvShows}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.s,
    paddingVertical: SPACING.s,
  },
  title: {
    flex: 1,
    fontSize: FONT_SIZE.m,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
  titleCompact: {
    fontSize: FONT_SIZE.s,
  },
  total: {
    fontSize: FONT_SIZE.xl,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.text,
  },
  totalCompact: {
    fontSize: FONT_SIZE.l,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  hairline: {
    height: 1,
    marginLeft: SPACING.xl,
    backgroundColor: COLORS.surfaceLight,
    opacity: 0.6,
  },
  splitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.m,
    paddingLeft: SPACING.xl,
  },
  splitRowCompact: {
    paddingVertical: SPACING.s,
  },
  tvLabelColumn: {
    gap: 2,
  },
  splitLabel: {
    fontSize: FONT_SIZE.s,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
  },
  splitLabelCompact: {
    fontSize: FONT_SIZE.s,
  },
  episodeDetail: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.regular,
    color: COLORS.textSecondary,
    opacity: 0.75,
  },
  splitValue: {
    fontSize: FONT_SIZE.l,
    fontFamily: FONT_FAMILY.semiBold,
    color: COLORS.text,
  },
  splitValueCompact: {
    fontSize: FONT_SIZE.m,
  },
});
