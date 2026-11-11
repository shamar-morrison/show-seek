import { COLORS, SPACING } from '@/src/constants/theme';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import {
  BulbIcon,
  Delete02Icon,
  DiscordIcon,
  // Globe02Icon, // Hidden: ShowSeek web app link disabled
  InformationCircleIcon,
  Megaphone01Icon,
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
  /** Whether cache clear is in progress */
  isClearingCache: boolean;
  /** Handler for Rate App button */
  onRateApp: () => void;
  /** Handler for Clear Cache button */
  onClearCache: () => void;
  /** Handler for Web App button */
  onWebApp: () => void;
  /** Handler for About button */
  onAbout: () => void;
  /** Handler for Join Discord button */
  onDiscord: () => void;
  /** Handler for Tips & Features button */
  onTips: () => void;
  /** Shows the current What's New announcement again; the row is hidden without one. */
  onWhatsNew?: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
}

/**
 * General section with app-level actions such as rating and cache management.
 * Account-level actions (export, delete, sign-out) live on the Account screen.
 */
export function AppSettingsSection({
  isGuest,
  isClearingCache,
  onRateApp,
  onClearCache,
  // onWebApp, // Hidden: ShowSeek web app link disabled
  onAbout,
  onDiscord,
  onTips,
  onWhatsNew,
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
        <ActionButton
          icon={BulbIcon}
          label={t('tips.title')}
          onPress={onTips}
          testID="action-button-tips"
        />
        {onWhatsNew ? (
          <ActionButton
            icon={Megaphone01Icon}
            label={t('settings.whatsNew')}
            onPress={onWhatsNew}
            testID="action-button-whats-new"
          />
        ) : null}
        <ActionButton icon={StarIcon} label={t('profile.rateApp')} onPress={onRateApp} />
        {!isGuest && (
          <ActionButton
            icon={Delete02Icon}
            label={t('profile.clearCache')}
            onPress={onClearCache}
            loading={isClearingCache}
          />
        )}
        {/* Hidden: ShowSeek web app link disabled */}
        {/* <ActionButton icon={Globe02Icon} label={t('profile.webApp')} onPress={onWebApp} /> */}
        <ActionButton icon={InformationCircleIcon} label={t('settings.about')} onPress={onAbout} />
        <ActionButton
          customIcon={<AppIcon icon={DiscordIcon} size={20} color={COLORS.text} />}
          label={t('profile.joinDiscord')}
          onPress={onDiscord}
        />
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
