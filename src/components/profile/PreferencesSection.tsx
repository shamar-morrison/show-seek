import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { UserPreferences } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import React, { Fragment, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PreferenceItem } from './PreferenceItem';

/** Category keys (under `profile.categories`) for grouping preference items. */
export type PreferenceCategoryKey =
  | 'listAndWatchBehavior'
  | 'contentVisibility'
  | 'display'
  | 'performance';

export interface PreferenceConfigItem {
  /** Preference key (also used as the stable search/scroll id) */
  key: keyof UserPreferences;
  /** Translation key for the title (except copyInsteadOfMove, which is dynamic) */
  titleKey: string;
  /** Translation key for the description */
  descKey: string;
  category: PreferenceCategoryKey;
  /** Premium-locked items show a lock badge instead of a switch */
  locked?: boolean;
}

/** Stable render order for preference category groups. */
export const PREFERENCE_CATEGORY_ORDER: PreferenceCategoryKey[] = [
  'listAndWatchBehavior',
  'contentVisibility',
  'display',
  'performance',
];

export const PREFERENCE_ITEMS: PreferenceConfigItem[] = [
  { key: 'autoAddToWatching', titleKey: 'profile.autoAddToWatching', descKey: 'profile.autoAddToWatchingDescription', category: 'listAndWatchBehavior' },
  { key: 'autoAddToAlreadyWatched', titleKey: 'profile.autoAddToAlreadyWatched', descKey: 'profile.autoAddToAlreadyWatchedDescription', category: 'listAndWatchBehavior' },
  { key: 'autoRemoveFromShouldWatch', titleKey: 'profile.autoRemoveFromShouldWatch', descKey: 'profile.autoRemoveFromShouldWatchDescription', category: 'listAndWatchBehavior' },
  { key: 'copyInsteadOfMove', titleKey: 'profile.defaultBulkAction', descKey: 'profile.defaultBulkActionDescription', category: 'listAndWatchBehavior' },
  { key: 'quickMarkAsWatched', titleKey: 'profile.quickMarkAsWatched', descKey: 'profile.quickMarkAsWatchedDescription', category: 'listAndWatchBehavior' },
  { key: 'markPreviousEpisodesWatched', titleKey: 'profile.markPreviousEpisodes', descKey: 'profile.markPreviousEpisodesDescription', category: 'listAndWatchBehavior' },
  { key: 'allowUnreleasedEpisodeWatches', titleKey: 'profile.allowUnreleasedEpisodeWatches', descKey: 'profile.allowUnreleasedEpisodeWatchesDescription', category: 'listAndWatchBehavior' },
  { key: 'blurPlotSpoilers', titleKey: 'profile.blurPlotSpoilers', descKey: 'profile.blurPlotSpoilersDescription', category: 'contentVisibility', locked: true },
  { key: 'hideWatchedContent', titleKey: 'profile.hideWatchedContent', descKey: 'profile.hideWatchedContentDescription', category: 'contentVisibility', locked: true },
  { key: 'hideUnreleasedContent', titleKey: 'profile.hideUnreleased', descKey: 'profile.hideUnreleasedDescription', category: 'contentVisibility' },
  { key: 'hideTalkShowsAndAwards', titleKey: 'profile.hideTalkShowsAndAwards', descKey: 'profile.hideTalkShowsAndAwardsDescription', category: 'contentVisibility' },
  { key: 'showListIndicators', titleKey: 'profile.showListIndicators', descKey: 'profile.showListIndicatorsDescription', category: 'display' },
  { key: 'hideTabLabels', titleKey: 'profile.hideTabLabels', descKey: 'profile.hideTabLabelsDescription', category: 'display' },
  { key: 'showOriginalTitles', titleKey: 'profile.showOriginalTitles', descKey: 'profile.showOriginalTitlesDescription', category: 'display' },
  { key: 'dataSaver', titleKey: 'profile.dataSaver', descKey: 'profile.dataSaverDescription', category: 'performance' },
];

export interface PreferencesSectionProps {
  /** User preferences object */
  preferences: UserPreferences | null;
  /** Whether preferences are loading */
  isLoading: boolean;
  /** Error loading preferences */
  error: Error | null;
  /** Handler to retry loading preferences */
  onRetry: () => void;
  /** Handler to update a preference */
  onUpdate: (key: keyof UserPreferences, value: boolean) => void;
  /** Whether an update is pending */
  isUpdating: boolean;
  /** Preference key currently updating (for per-item spinner) */
  updatingPreferenceKey?: keyof UserPreferences | null;
  /** Whether user has premium */
  isPremium: boolean;
  /** Handler when premium-locked item is pressed */
  onPremiumPress: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
  /** Id of the item to briefly highlight (e.g. from profile search) */
  highlightedId?: string | null;
  /** Reports an item's content-relative Y-offset for scroll-to from profile search */
  registerItemLayout?: (id: string, y: number) => void;
}

/**
 * Preferences section containing all toggle switches for user preferences.
 * Uses PreferenceItem component for consistent styling.
 */
export function PreferencesSection({
  preferences,
  isLoading,
  error,
  onRetry,
  onUpdate,
  isUpdating,
  updatingPreferenceKey = null,
  isPremium,
  onPremiumPress,
  showTitle = true,
  highlightedId = null,
  registerItemLayout,
}: PreferencesSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const bulkActionModeLabel = preferences?.copyInsteadOfMove ? t('common.copy') : t('common.move');
  const defaultBulkActionLabel = t('profile.defaultBulkAction', { mode: bulkActionModeLabel });

  const isItemUpdating = (key: keyof UserPreferences) =>
    isUpdating && updatingPreferenceKey === key;

  const handleUpdate = (key: keyof UserPreferences, value: boolean) => {
    onUpdate(key, value);
  };

  // Offset of this section's root within the scroll content, plus each row's
  // offset within the root. Rows are direct children of the root (groups are
  // fragments), so root + row is the content-relative offset. Children lay out
  // before parents on mount, so the root handler re-emits all known rows.
  const rootOffsetY = useRef(0);
  const rowOffsetY = useRef<Record<string, number>>({});

  const emitRowOffset = (id: string, rowY: number) => {
    rowOffsetY.current[id] = rowY;
    registerItemLayout?.(id, rootOffsetY.current + rowY);
  };

  const handleRootLayout = (y: number) => {
    rootOffsetY.current = y;
    for (const [id, rowY] of Object.entries(rowOffsetY.current)) {
      registerItemLayout?.(id, y + rowY);
    }
  };

  if (error) {
    return (
      <View style={[styles.preferencesSection, !showTitle && styles.noTitleSection]}>
        {showTitle && (
          <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
            {t('settings.preferences').toUpperCase()}
          </Text>
        )}
        <View style={styles.errorContainer}>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceLabel}>{t('profile.unableToLoadPreferences')}</Text>
            <Text style={styles.preferenceSubtitle}>{t('profile.checkConnection')}</Text>
          </View>
          <TouchableOpacity
            style={[
              styles.retryButton,
              { backgroundColor: accentColor },
              isLoading && styles.retryButtonDisabled,
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onRetry();
            }}
            activeOpacity={ACTIVE_OPACITY}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={COLORS.white} />
            ) : (
              <Text style={styles.retryButtonText}>{t('common.retry')}</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.preferencesSection, !showTitle && styles.noTitleSection]}
      testID="profile-preferences-root"
      onLayout={(event) => handleRootLayout(event.nativeEvent.layout.y)}
    >
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
          {t('settings.preferences').toUpperCase()}
        </Text>
      )}

      {PREFERENCE_CATEGORY_ORDER.map((category) => {
        const items = PREFERENCE_ITEMS.filter((item) => item.category === category);
        if (items.length === 0) {
          return null;
        }
        return (
          <Fragment key={category}>
            <Text style={[sectionTitleStyles.title, styles.categoryTitle]}>
              {t(`profile.categories.${category}` as const).toUpperCase()}
            </Text>
            {items.map((item) => {
              const label =
                item.key === 'copyInsteadOfMove' ? defaultBulkActionLabel : t(item.titleKey);
              const highlighted = highlightedId === item.key;
              return (
                <View
                  key={item.key}
                  collapsable={false}
                  testID={`search-item-${item.key}`}
                  onLayout={(event) => emitRowOffset(item.key, event.nativeEvent.layout.y)}
                  style={[
                    styles.itemWrapper,
                    highlighted && {
                      borderColor: accentColor,
                      backgroundColor: hexToRGBA(accentColor, 0.15),
                    },
                  ]}
                >
                  <PreferenceItem
                    label={label}
                    subtitle={t(item.descKey)}
                    value={!!preferences?.[item.key]}
                    onValueChange={(value) => handleUpdate(item.key, value)}
                    loading={isLoading || isItemUpdating(item.key)}
                    disabled={isUpdating}
                    isLocked={item.locked && !isPremium}
                    onLockPress={onPremiumPress}
                  />
                </View>
              );
            })}
          </Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  preferencesSection: {
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.l,
    gap: SPACING.m,
  },
  noTitleSection: {
    paddingHorizontal: 0,
    marginTop: 0,
  },
  sectionTitle: {
    marginBottom: SPACING.m,
  },
  categoryTitle: {
    marginBottom: SPACING.s,
  },
  itemWrapper: {
    borderWidth: 1,
    borderColor: COLORS.transparent,
    borderRadius: BORDER_RADIUS.l,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.l,
    padding: SPACING.m,
    gap: SPACING.m,
  },
  preferenceInfo: {
    flex: 1,
  },
  preferenceLabel: {
    fontSize: FONT_SIZE.m,
    color: COLORS.text,
    fontFamily: FONT_FAMILY.medium,
    marginBottom: SPACING.xs,
  },
  preferenceSubtitle: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },
  retryButton: {
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
  },
  retryButtonText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.white,
    fontFamily: FONT_FAMILY.semiBold,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
});
