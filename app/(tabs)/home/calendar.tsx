import { CalendarPremiumGate } from '@/src/components/calendar/CalendarPremiumGate';
import { ReleaseCalendar } from '@/src/components/calendar/ReleaseCalendar';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAuth } from '@/src/context/auth';
import { usePremium } from '@/src/context/PremiumContext';
import { useUpcomingReleases } from '@/src/hooks/useUpcomingReleases';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Calendar, LogIn } from 'lucide-react-native';
import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

/**
 * Release Calendar screen displaying upcoming releases from user's tracked content.
 * Shows items from Watchlist, Favorites, and Reminders with future release dates.
 * Premium-only feature - non-premium users see the CalendarPremiumGate.
 */
export default function CalendarScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();
  const router = useRouter();

  const { sections, isLoading, isLoadingEnrichment } = useUpcomingReleases();

  const isGuest = !user || user.isAnonymous;

  // Haptic feedback on mount
  useEffect(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSignIn = () => {
    router.push({ pathname: '/(auth)/sign-in' });
  };

  const handleGoToLibrary = () => {
    router.push({ pathname: '/(tabs)/library' });
  };

  // Guest state - show sign in prompt
  if (isGuest) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <LogIn size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('calendar.signInRequired')}</Text>
          <Text style={styles.emptyDescription}>{t('calendar.signInDescription')}</Text>
          <Pressable style={styles.primaryButton} onPress={handleSignIn}>
            <Text style={styles.primaryButtonText}>{t('auth.signIn')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // Premium gate - show teaser for non-premium users
  // Default to locked view while loading (safe default)
  if (isPremiumLoading || !isPremium) {
    return <CalendarPremiumGate />;
  }

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Empty state - no upcoming releases
  if (sections.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
        <View style={styles.emptyContainer}>
          <View style={styles.iconContainer}>
            <Calendar size={64} color={COLORS.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('calendar.empty')}</Text>
          <Text style={styles.emptyDescription}>{t('calendar.emptyHint')}</Text>
          <Pressable style={styles.primaryButton} onPress={handleGoToLibrary}>
            <Text style={styles.primaryButtonText}>{t('calendar.goToWatchlist')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom', 'left', 'right']}>
      {/* Enrichment loading indicator */}
      {isLoadingEnrichment && (
        <View style={styles.enrichmentIndicator}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.enrichmentText}>Updating TV episodes...</Text>
        </View>
      )}

      <ReleaseCalendar sections={sections} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.m,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.m,
  },
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
    backgroundColor: COLORS.primary,
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
