import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { SUPPORTED_LANGUAGES } from '@/src/context/LanguageProvider';
import { SUPPORTED_REGIONS } from '@/src/context/RegionProvider';
import { UserPreferences } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import { Check, Languages, LayoutIcon, MapPin } from 'lucide-react-native';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';

export interface ContentSettingsSectionProps {
  /** Current language code */
  language: string;
  /** Current region code */
  region: string;
  /** User preferences (for default launch screen) */
  preferences: UserPreferences | null;
  /** Whether Trakt is connected */
  isTraktConnected: boolean;
  /** Whether Trakt status is loading */
  isTraktLoading: boolean;
  /** Whether user is a guest */
  isGuest: boolean;
  /** Handler for language button press */
  onLanguagePress: () => void;
  /** Handler for region button press */
  onRegionPress: () => void;
  /** Handler for launch screen button press */
  onLaunchScreenPress: () => void;
  /** Handler for Trakt settings button press */
  onTraktPress: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
}

/**
 * Content settings section with Language, Region, Launch Screen, and Trakt integration.
 */
export function ContentSettingsSection({
  language,
  region,
  preferences,
  isTraktConnected,
  isTraktLoading,
  isGuest,
  onLanguagePress,
  onRegionPress,
  onLaunchScreenPress,
  onTraktPress,
  showTitle = true,
}: ContentSettingsSectionProps) {
  const { t } = useTranslation();

  const getDefaultLaunchScreenLabel = () => {
    switch (preferences?.defaultLaunchScreen) {
      case '/(tabs)/discover':
        return 'Discover';
      case '/(tabs)/search':
        return 'Search';
      case '/(tabs)/library':
        return 'Library';
      case '/(tabs)/profile':
        return 'Profile';
      default:
        return 'Home';
    }
  };

  return (
    <View style={[styles.actionsSection, !showTitle && styles.noTitleSection]}>
      {showTitle && <Text style={styles.sectionTitle}>CONTENT</Text>}
      <View style={styles.actionsList}>
        <ActionButton
          icon={Languages}
          label="Language"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onLanguagePress();
          }}
          badge={
            <View style={styles.languageBadge}>
              <Text style={styles.languageBadgeText}>
                {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.nativeName.split(' ')[0] ||
                  'EN'}
              </Text>
            </View>
          }
        />
        <ActionButton
          icon={MapPin}
          label={t('settings.region')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            onRegionPress();
          }}
          badge={
            <View style={styles.languageBadge}>
              <Text style={styles.languageBadgeText}>
                {SUPPORTED_REGIONS.find((r) => r.code === region)?.emoji || '🌍'} {region}
              </Text>
            </View>
          }
        />
        {!isGuest && (
          <ActionButton
            icon={LayoutIcon}
            label={t('settings.defaultLaunchScreen')}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onLaunchScreenPress();
            }}
            badge={
              <View style={styles.languageBadge}>
                <Text style={styles.languageBadgeText}>{getDefaultLaunchScreenLabel()}</Text>
              </View>
            }
          />
        )}
        {!isGuest && (
          <ActionButton
            customIcon={<TraktLogo size={20} />}
            label={t('profile.traktIntegration')}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onTraktPress();
            }}
            loading={isTraktLoading}
            badge={
              isTraktConnected ? (
                <View style={styles.traktConnectedBadge}>
                  <Check size={12} color={COLORS.white} />
                </View>
              ) : null
            }
          />
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
  languageBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
    marginLeft: SPACING.s,
  },
  languageBadgeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontWeight: '600',
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
