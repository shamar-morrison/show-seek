import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

interface ReminderWarningBannerProps {
  message?: string;
}

/**
 * Warning banner for when some (but not all) timing options have passed.
 */
export function ReminderWarningBanner({
  message,
}: ReminderWarningBannerProps) {
  const { t } = useTranslation();
  const resolvedMessage = message ?? t('reminder.warningSomeTimesPassed');

  return (
    <View style={styles.warningBanner}>
      <Text style={styles.warningBannerText}>{resolvedMessage}</Text>
    </View>
  );
}

interface ReminderErrorBannerProps {
  message: string;
}

/**
 * Error banner for when all timing options have passed.
 */
export function ReminderErrorBanner({ message }: ReminderErrorBannerProps) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
    </View>
  );
}

interface DevModeBannerProps {
  message?: string;
}

/**
 * Dev mode banner shown during development.
 */
export function DevModeBanner({
  message,
}: DevModeBannerProps) {
  const { t } = useTranslation();
  const resolvedMessage = message ?? t('reminder.devBanner');

  if (!__DEV__) return null;

  return (
    <View style={styles.devBanner}>
      <Text style={styles.devBannerText}>{resolvedMessage}</Text>
    </View>
  );
}

interface ReminderInfoBannerProps {
  message: string;
}

/**
 * Info banner for informational messages (e.g., using subsequent episode).
 */
export function ReminderInfoBanner({ message }: ReminderInfoBannerProps) {
  return (
    <View style={styles.infoBanner}>
      <Text style={styles.infoBannerText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  warningBanner: {
    backgroundColor: COLORS.warning + '20',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.warning,
  },
  warningBannerText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.warning,
    textAlign: 'center',
  },
  errorBanner: {
    backgroundColor: COLORS.error + '20',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.error,
  },
  errorBannerText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.error,
    textAlign: 'center',
  },
  devBanner: {
    backgroundColor: COLORS.warning,
    padding: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
  },
  devBannerText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.background,
    textAlign: 'center',
    fontWeight: '600',
  },
  infoBanner: {
    backgroundColor: COLORS.primary + '20',
    padding: SPACING.m,
    borderRadius: BORDER_RADIUS.m,
    marginBottom: SPACING.m,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  infoBannerText: {
    fontSize: FONT_SIZE.s,
    color: COLORS.white,
    textAlign: 'center',
  },
});
