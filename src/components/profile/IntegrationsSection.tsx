import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { ActionButton } from '@/src/components/profile/ActionButton';
import { BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export interface IntegrationsSectionProps {
  /** Whether user has premium */
  isPremium: boolean;
  /** Whether Trakt is connected */
  isTraktConnected: boolean;
  /** Whether Trakt status is loading */
  isTraktLoading: boolean;
  /** Handler for IMDb import button */
  onImdbImport: () => void;
  /** Handler for Trakt settings button press */
  onTraktPress: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
}

/**
 * Profile section for third-party account and data integrations.
 */
export function IntegrationsSection({
  isPremium,
  isTraktConnected,
  isTraktLoading,
  onImdbImport,
  onTraktPress,
  showTitle = true,
}: IntegrationsSectionProps) {
  const { t } = useTranslation();

  return (
    <View style={[styles.actionsSection, !showTitle && styles.noTitleSection]}>
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
          {t('profile.tabs.integrations')}
        </Text>
      )}
      <View style={styles.actionsList}>
        <ActionButton
          customIcon={
            <View style={styles.imdbLogoContainer} testID="integrations-imdb-icon">
              <Image
                source={require('@/assets/images/imdb.png')}
                contentFit="contain"
                style={styles.imdbLogo}
              />
            </View>
          }
          label={t('profile.importFromImdb')}
          onPress={onImdbImport}
          isPremiumFeature
          isPremium={isPremium}
        />
        <ActionButton
          customIcon={<TraktLogo size={21} />}
          label={t('profile.traktIntegration')}
          onPress={onTraktPress}
          loading={isTraktLoading}
          badge={
            isTraktConnected ? (
              <View style={styles.traktConnectedBadge} testID="integrations-trakt-connected-badge">
                <Check size={12} color={COLORS.white} />
              </View>
            ) : null
          }
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
  imdbLogoContainer: {
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.s,
    justifyContent: 'center',
    minWidth: 26,
    paddingVertical: 2,
    marginRight: -SPACING.s,
  },
  imdbLogo: {
    height: 14,
    width: 35,
  },
  traktConnectedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: SPACING.xs,
  },
});
