import { SPACING } from '@/src/constants/theme';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { Download, Globe, Info, LogOut, MessageCircle, Star, Trash2 } from 'lucide-react-native';
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
  /** Whether cache clear is in progress */
  isClearingCache: boolean;
  /** Whether sign out is in progress */
  isSigningOut: boolean;
  /** Whether account deletion is in progress */
  isDeletingAccount: boolean;
  /** Handler for Rate App button */
  onRateApp: () => void;
  /** Handler for Send Feedback button */
  onFeedback: () => void;
  /** Handler for Export Data button */
  onExportData: () => void;
  /** Handler for Clear Cache button */
  onClearCache: () => void;
  /** Handler for Web App button */
  onWebApp: () => void;
  /** Handler for About button */
  onAbout: () => void;
  /** Handler for Delete Account button */
  onDeleteAccount: () => void;
  /** Handler for Sign Out button */
  onSignOut: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
}

/**
 * App settings section with app actions such as feedback, export, cache management, and sign-out.
 */
export function AppSettingsSection({
  isGuest,
  isPremium,
  isExporting,
  isClearingCache,
  isSigningOut,
  isDeletingAccount,
  onRateApp,
  onFeedback,
  onExportData,
  onClearCache,
  onWebApp,
  onAbout,
  onDeleteAccount,
  onSignOut,
  showTitle = true,
}: AppSettingsSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={[styles.actionsSection, !showTitle && styles.noTitleSection]}>
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
          {t('settings.title').toUpperCase()}
        </Text>
      )}
      <View style={styles.actionsList}>
        <ActionButton icon={Star} label={t('profile.rateApp')} onPress={onRateApp} />
        <ActionButton icon={MessageCircle} label={t('profile.sendFeedback')} onPress={onFeedback} />
        {isGuest ? (
          <>
            <ActionButton icon={Info} label={t('settings.about')} onPress={onAbout} />
            <ActionButton
              icon={Trash2}
              label={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
              onPress={onDeleteAccount}
              loading={isDeletingAccount}
              variant="danger"
            />
            <ActionButton
              icon={LogOut}
              label={isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
              onPress={onSignOut}
              loading={isSigningOut}
            />
            <ActionButton icon={Globe} label={t('profile.webApp')} onPress={onWebApp} />
          </>
        ) : (
          <>
            <ActionButton
              icon={Download}
              label={t('profile.exportData')}
              onPress={onExportData}
              loading={isExporting}
              isPremiumFeature
              isPremium={isPremium}
            />
            <ActionButton
              icon={Trash2}
              label={t('profile.clearCache')}
              onPress={onClearCache}
              loading={isClearingCache}
            />
            {/* <ActionButton icon={Globe} label={t('profile.webApp')} onPress={onWebApp} /> */}
            <ActionButton icon={Info} label={t('settings.about')} onPress={onAbout} />
            <ActionButton
              icon={Trash2}
              label={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
              onPress={onDeleteAccount}
              loading={isDeletingAccount}
              variant="danger"
            />
            <ActionButton
              icon={LogOut}
              label={isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
              onPress={onSignOut}
              loading={isSigningOut}
            />
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsSection: {
    paddingHorizontal: SPACING.l,
    marginTop: SPACING.l,
  },
  noTitleSection: {
    paddingHorizontal: 0,
    marginTop: 0,
  },
  sectionTitle: {
    marginBottom: SPACING.m,
  },
  actionsList: {
    gap: SPACING.s,
  },
});
