import { COLORS, SPACING } from '@/src/constants/theme';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import {
  Delete02Icon,
  DiscordIcon,
  Download01Icon,
  Globe02Icon,
  InformationCircleIcon,
  Logout01Icon,
  StarIcon,
} from '@hugeicons/core-free-icons';
import { AppIcon } from '@/src/components/ui/AppIcon';
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
  /** Handler for Export Data button */
  onExportData: () => void;
  /** Handler for Clear Cache button */
  onClearCache: () => void;
  /** Handler for Web App button */
  onWebApp: () => void;
  /** Handler for About button */
  onAbout: () => void;
  /** Handler for Join Discord button */
  onDiscord: () => void;
  /** Handler for Delete Account button */
  onDeleteAccount: () => void;
  /** Handler for Sign Out button */
  onSignOut: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
}

/**
 * App settings section with app actions such as export, cache management, and sign-out.
 */
export function AppSettingsSection({
  isGuest,
  isPremium,
  isExporting,
  isClearingCache,
  isSigningOut,
  isDeletingAccount,
  onRateApp,
  onExportData,
  onClearCache,
  onWebApp,
  onAbout,
  onDiscord,
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
        <ActionButton icon={StarIcon} label={t('profile.rateApp')} onPress={onRateApp} />
        {isGuest ? (
          <>
            <ActionButton
              icon={InformationCircleIcon}
              label={t('settings.about')}
              onPress={onAbout}
            />
            <ActionButton
              customIcon={<AppIcon icon={DiscordIcon} size={20} color={COLORS.text} />}
              label={t('profile.joinDiscord')}
              onPress={onDiscord}
            />
            <ActionButton
              icon={Delete02Icon}
              label={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
              onPress={onDeleteAccount}
              loading={isDeletingAccount}
              variant="danger"
            />
            <ActionButton
              icon={Logout01Icon}
              label={isSigningOut ? t('auth.signingOut') : t('auth.signOut')}
              onPress={onSignOut}
              loading={isSigningOut}
            />
            <ActionButton icon={Globe02Icon} label={t('profile.webApp')} onPress={onWebApp} />
          </>
        ) : (
          <>
            <ActionButton
              icon={Download01Icon}
              label={t('profile.exportData')}
              onPress={onExportData}
              loading={isExporting}
              isPremiumFeature
              isPremium={isPremium}
            />
            <ActionButton
              icon={Delete02Icon}
              label={t('profile.clearCache')}
              onPress={onClearCache}
              loading={isClearingCache}
            />
            <ActionButton icon={Globe02Icon} label={t('profile.webApp')} onPress={onWebApp} />
            <ActionButton
              icon={InformationCircleIcon}
              label={t('settings.about')}
              onPress={onAbout}
            />
            <ActionButton
              customIcon={<AppIcon icon={DiscordIcon} size={20} color={COLORS.text} />}
              label={t('profile.joinDiscord')}
              onPress={onDiscord}
            />
            <ActionButton
              icon={Delete02Icon}
              label={isDeletingAccount ? t('profile.deletingAccount') : t('profile.deleteAccount')}
              onPress={onDeleteAccount}
              loading={isDeletingAccount}
              variant="danger"
            />
            <ActionButton
              icon={Logout01Icon}
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
