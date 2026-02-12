import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { FullScreenLoading } from '@/src/components/ui/FullScreenLoading';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { usePremium } from '@/src/context/PremiumContext';
import { useUpcomingReleases } from '@/src/hooks/useUpcomingReleases';
import { screenStyles } from '@/src/styles/screenStyles';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Release Calendar screen displaying upcoming releases from user's tracked content.
 * Shows items from Watchlist, Favorites, and Reminders with future release dates.
 * Free users get a limited preview while premium users get full access.
 */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const router = useRouter();
  const { accentColor } = useAccentColor();

  const { sections, allReleases, isLoading, isLoadingEnrichment } = useUpcomingReleases();

  // Haptic feedback on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleGoToLibrary = () => {
    router.push({ pathname: '/(tabs)/library' });
  };

  // Loading state
  if (isPremiumLoading || isLoading) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <FullScreenLoading message={t('common.loading')} />
      </SafeAreaView>
    );
  }

  // Empty state - no upcoming releases
  if (sections.length === 0) {
    return (
      <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <Calendar size={64} color={accentColor} />
          </View>
          <Text style={styles.emptyTitle}>{t('calendar.empty')}</Text>
          <Text style={styles.emptyDescription}>{t('calendar.emptyHint')}</Text>
          <Pressable style={[styles.primaryButton, { backgroundColor: accentColor }]} onPress={handleGoToLibrary}>
            <Text style={styles.primaryButtonText}>{t('calendar.goToWatchlist')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const previewLimit = !isPremium ? 3 : undefined;
  const showUpgradeOverlay = !isPremium && allReleases.length > 3;

  return (
    <SafeAreaView style={screenStyles.container} edges={['bottom', 'left', 'right']}>
      {/* Enrichment loading indicator */}
      {isLoadingEnrichment && (
        <View style={styles.enrichmentIndicator}>
          <ActivityIndicator size="small" color={accentColor} />
          <Text style={styles.enrichmentText}>{t('calendar.updatingEpisodes')}</Text>
        </View>
      )}

      <ReleaseCalendar
        sections={sections}
        previewLimit={previewLimit}
        showUpgradeOverlay={showUpgradeOverlay}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xl,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.l,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.m,
  },
  emptyDescription: {
    fontSize: FONT_SIZE.m,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: SPACING.xl,
  },
  primaryButton: {
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.m,
    borderRadius: 12,
  },
  primaryButtonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.white,
  },
  enrichmentIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.s,
    backgroundColor: COLORS.surface,
  },
  enrichmentText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
