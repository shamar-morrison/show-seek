import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { UserPreferences } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { PreferenceItem } from './PreferenceItem';

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
}: PreferencesSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  const isItemUpdating = (key: keyof UserPreferences) =>
    isUpdating && updatingPreferenceKey === key;

  const handleUpdate = (key: keyof UserPreferences, value: boolean) => {
    onUpdate(key, value);
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
    <View style={[styles.preferencesSection, !showTitle && styles.noTitleSection]}>
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
          {t('settings.preferences').toUpperCase()}
        </Text>
      )}

      <PreferenceItem
        label={t('profile.autoAddToWatching')}
        subtitle={t('profile.autoAddToWatchingDescription')}
        value={!!preferences?.autoAddToWatching}
        onValueChange={(value) => handleUpdate('autoAddToWatching', value)}
        loading={isLoading || isItemUpdating('autoAddToWatching')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.autoAddToAlreadyWatched')}
        subtitle={t('profile.autoAddToAlreadyWatchedDescription')}
        value={!!preferences?.autoAddToAlreadyWatched}
        onValueChange={(value) => handleUpdate('autoAddToAlreadyWatched', value)}
        loading={isLoading || isItemUpdating('autoAddToAlreadyWatched')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.showListIndicators')}
        subtitle={t('profile.showListIndicatorsDescription')}
        value={!!preferences?.showListIndicators}
        onValueChange={(value) => handleUpdate('showListIndicators', value)}
        loading={isLoading || isItemUpdating('showListIndicators')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.copyInsteadOfMove')}
        subtitle={t('profile.copyInsteadOfMoveDescription')}
        value={!!preferences?.copyInsteadOfMove}
        onValueChange={(value) => handleUpdate('copyInsteadOfMove', value)}
        loading={isLoading || isItemUpdating('copyInsteadOfMove')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.quickMarkAsWatched')}
        subtitle={t('profile.quickMarkAsWatchedDescription')}
        value={!!preferences?.quickMarkAsWatched}
        onValueChange={(value) => handleUpdate('quickMarkAsWatched', value)}
        loading={isLoading || isItemUpdating('quickMarkAsWatched')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.markPreviousEpisodes')}
        subtitle={t('profile.markPreviousEpisodesDescription')}
        value={!!preferences?.markPreviousEpisodesWatched}
        onValueChange={(value) => handleUpdate('markPreviousEpisodesWatched', value)}
        loading={isLoading || isItemUpdating('markPreviousEpisodesWatched')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.blurPlotSpoilers')}
        subtitle={t('profile.blurPlotSpoilersDescription')}
        value={!!preferences?.blurPlotSpoilers}
        onValueChange={(value) => handleUpdate('blurPlotSpoilers', value)}
        loading={isLoading || isItemUpdating('blurPlotSpoilers')}
        disabled={isUpdating}
        isLocked={!isPremium}
        onLockPress={onPremiumPress}
      />

      <PreferenceItem
        label={t('profile.hideWatchedContent')}
        subtitle={t('profile.hideWatchedContentDescription')}
        value={!!preferences?.hideWatchedContent}
        onValueChange={(value) => handleUpdate('hideWatchedContent', value)}
        loading={isLoading || isItemUpdating('hideWatchedContent')}
        disabled={isUpdating}
        isLocked={!isPremium}
        onLockPress={onPremiumPress}
      />

      <PreferenceItem
        label={t('profile.hideUnreleased')}
        subtitle={t('profile.hideUnreleasedDescription')}
        value={!!preferences?.hideUnreleasedContent}
        onValueChange={(value) => handleUpdate('hideUnreleasedContent', value)}
        loading={isLoading || isItemUpdating('hideUnreleasedContent')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.hideTabLabels')}
        subtitle={t('profile.hideTabLabelsDescription')}
        value={!!preferences?.hideTabLabels}
        onValueChange={(value) => handleUpdate('hideTabLabels', value)}
        loading={isLoading || isItemUpdating('hideTabLabels')}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.dataSaver')}
        subtitle={t('profile.dataSaverDescription')}
        value={!!preferences?.dataSaver}
        onValueChange={(value) => handleUpdate('dataSaver', value)}
        loading={isLoading || isItemUpdating('dataSaver')}
        disabled={isUpdating}
      />
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
    fontWeight: '500',
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
    fontWeight: '600',
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
});
