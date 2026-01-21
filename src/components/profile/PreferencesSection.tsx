import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
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
  /** Whether user has premium */
  isPremium: boolean;
  /** Handler when premium-locked item is pressed */
  onPremiumPress: () => void;
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
  isPremium,
  onPremiumPress,
}: PreferencesSectionProps) {
  const { t } = useTranslation();

  const handleUpdate = (key: keyof UserPreferences, value: boolean) => {
    onUpdate(key, value);
  };

  const handleUpdateWithError = (key: keyof UserPreferences, value: boolean) => {
    handleUpdate(key, value);
  };

  if (error) {
    return (
      <View style={styles.preferencesSection}>
        <Text style={styles.sectionTitle}>{t('settings.preferences').toUpperCase()}</Text>
        <View style={styles.errorContainer}>
          <View style={styles.preferenceInfo}>
            <Text style={styles.preferenceLabel}>Unable to load preferences</Text>
            <Text style={styles.preferenceSubtitle}>
              Please check your connection and try again
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.retryButton, isLoading && styles.retryButtonDisabled]}
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
              <Text style={styles.retryButtonText}>Retry</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.preferencesSection}>
      <Text style={styles.sectionTitle}>{t('settings.preferences').toUpperCase()}</Text>

      <PreferenceItem
        label={t('profile.autoAddToWatching')}
        subtitle={t('profile.autoAddToWatchingDescription')}
        value={!!preferences?.autoAddToWatching}
        onValueChange={(value) => handleUpdateWithError('autoAddToWatching', value)}
        loading={isLoading}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.autoAddToAlreadyWatched')}
        subtitle={t('profile.autoAddToAlreadyWatchedDescription')}
        value={!!preferences?.autoAddToAlreadyWatched}
        onValueChange={(value) => handleUpdateWithError('autoAddToAlreadyWatched', value)}
        loading={isLoading}
        disabled={isUpdating}
      />

      <PreferenceItem
        label="Show list indicators"
        subtitle="Display a badge on cards when an item is in any of your lists"
        value={!!preferences?.showListIndicators}
        onValueChange={(value) => handleUpdateWithError('showListIndicators', value)}
        loading={isLoading}
        disabled={isUpdating}
      />

      <PreferenceItem
        label={t('profile.quickMarkAsWatched')}
        subtitle={t('profile.quickMarkAsWatchedDescription')}
        value={!!preferences?.quickMarkAsWatched}
        onValueChange={(value) => handleUpdateWithError('quickMarkAsWatched', value)}
        loading={isLoading}
        disabled={isUpdating}
      />

      <PreferenceItem
        label="Blur movie and TV plot"
        subtitle="Hide plot summaries by default to avoid spoilers. Tap to reveal."
        value={!!preferences?.blurPlotSpoilers}
        onValueChange={(value) => handleUpdateWithError('blurPlotSpoilers', value)}
        loading={isLoading}
        disabled={isUpdating}
        isLocked={!isPremium}
        onLockPress={onPremiumPress}
      />

      <PreferenceItem
        label="Hide watched content"
        subtitle="Remove watched movies and shows from search and discovery"
        value={!!preferences?.hideWatchedContent}
        onValueChange={(value) => handleUpdateWithError('hideWatchedContent', value)}
        loading={isLoading}
        disabled={isUpdating}
        isLocked={!isPremium}
        onLockPress={onPremiumPress}
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
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    backgroundColor: COLORS.primary,
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
