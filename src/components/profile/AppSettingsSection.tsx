import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Download, Globe, LogOut, MessageCircle, Star } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';

export interface AppSettingsSectionProps {
  /** Whether user is a guest */
  isGuest: boolean;
  /** Whether user has premium */
  isPremium: boolean;
  /** Whether export is in progress */
  isExporting: boolean;
  /** Handler for Rate App button */
  onRateApp: () => void;
  /** Handler for Send Feedback button */
  onFeedback: () => void;
  /** Handler for Export Data button */
  onExportData: () => void;
  /** Handler for Web App button */
  onWebApp: () => void;
  /** Handler for Sign Out button */
  onSignOut: () => void;
}

/**
 * App settings section with Rate App, Feedback, Export Data, Web App, and Sign Out.
 */
export function AppSettingsSection({
  isGuest,
  isPremium,
  isExporting,
  onRateApp,
  onFeedback,
  onExportData,
  onWebApp,
  onSignOut,
}: AppSettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.actionsSection}>
      <Text style={styles.sectionTitle}>{t('settings.title').toUpperCase()}</Text>
      <View style={styles.actionsList}>
        <ActionButton icon={Star} label={t('profile.rateApp')} onPress={onRateApp} />
        <ActionButton icon={MessageCircle} label={t('profile.sendFeedback')} onPress={onFeedback} />
        {!isGuest && (
          <ActionButton
            icon={Download}
            label={t('profile.exportData')}
            onPress={onExportData}
            loading={isExporting}
            isPremiumFeature
            isPremium={isPremium}
          />
        )}
        <ActionButton icon={Globe} label={t('profile.webApp')} onPress={onWebApp} />
        <ActionButton icon={LogOut} label={t('auth.signOut')} onPress={onSignOut} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsSection: {
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.l,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: SPACING.m,
  },
  actionsList: {
    gap: SPACING.s,
  },
});
