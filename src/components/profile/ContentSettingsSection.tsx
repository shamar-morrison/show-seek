import { getAccentColorName } from '@/src/constants/accentColors';
import { SUPPORTED_LANGUAGES } from '@/src/constants/supportedLanguages';
import {
  BORDER_RADIUS,
  COLORS,
  FONT_FAMILY,
  FONT_SIZE,
  hexToRGBA,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { SUPPORTED_REGIONS } from '@/src/context/RegionProvider';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { UserPreferences } from '@/src/types/preferences';
import * as Haptics from 'expo-haptics';
import {
  Layout01Icon,
  MapPinIcon,
  PaintBoardIcon,
  TranslateIcon,
} from '@hugeicons/core-free-icons';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { ActionButton } from './ActionButton';

/** Stored (not rendered) category keys for content items. */
export type ContentCategoryKey = 'localization' | 'appearance';

export type ContentItemId = 'language' | 'region' | 'accentColor' | 'defaultLaunchScreen';

export interface ContentConfigItem {
  /** Stable id (also used as the search/scroll id) */
  id: ContentItemId;
  /** Translation key for the title */
  titleKey: string;
  category: ContentCategoryKey;
}

export const CONTENT_ITEMS: ContentConfigItem[] = [
  { id: 'language', titleKey: 'settings.language', category: 'localization' },
  { id: 'region', titleKey: 'settings.region', category: 'localization' },
  { id: 'accentColor', titleKey: 'settings.accentColor', category: 'appearance' },
  { id: 'defaultLaunchScreen', titleKey: 'settings.defaultLaunchScreen', category: 'appearance' },
];

export interface ContentSettingsSectionProps {
  /** Current language code */
  language: string;
  /** Current region code */
  region: string;
  /** User preferences (for default launch screen) */
  preferences: UserPreferences | null;
  /** Handler for language button press */
  onLanguagePress: () => void;
  /** Handler for region button press */
  onRegionPress: () => void;
  /** Handler for accent color button press */
  onColorPress: () => void;
  /** Handler for launch screen button press */
  onLaunchScreenPress: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
  /** Id of the item to briefly highlight (e.g. from profile search) */
  highlightedId?: string | null;
  /** Reports an item's content-relative Y-offset for scroll-to from profile search */
  registerItemLayout?: (id: string, y: number) => void;
}

/**
 * Content settings section with language, region, accent color, and launch screen controls.
 */
export function ContentSettingsSection({
  language,
  region,
  preferences,
  onLanguagePress,
  onRegionPress,
  onColorPress,
  onLaunchScreenPress,
  showTitle = true,
  highlightedId = null,
  registerItemLayout,
}: ContentSettingsSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();
  const accentLabel = getAccentColorName(accentColor);

  const getDefaultLaunchScreenLabel = () => {
    switch (preferences?.defaultLaunchScreen) {
      case '/(tabs)/discover':
        return t('discover.title');
      case '/(tabs)/search':
        return t('search.title');
      case '/(tabs)/library':
        return t('library.title');
      case '/(tabs)/profile':
        return t('profile.title');
      default:
        return t('home.title');
    }
  };

  // Rows are direct children of the section root, so root + row is the
  // content-relative offset. Children lay out before parents on mount, so the
  // root handler re-emits all known rows.
  const rootOffsetY = useRef(0);
  const rowOffsetY = useRef<Record<string, number>>({});

  const emitRowOffset = (id: string, rowY: number) => {
    rowOffsetY.current[id] = rowY;
    registerItemLayout?.(id, rootOffsetY.current + rowY);
  };

  const handleRootLayout = (y: number) => {
    rootOffsetY.current = y;
    for (const [id, rowY] of Object.entries(rowOffsetY.current)) {
      registerItemLayout?.(id, y + rowY);
    }
  };

  return (
    <View
      style={[styles.actionsSection, !showTitle && styles.noTitleSection]}
      testID="profile-content-root"
      onLayout={(event) => handleRootLayout(event.nativeEvent.layout.y)}
    >
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>{t('profile.content')}</Text>
      )}
      {CONTENT_ITEMS.map((item, index) => {
        const highlighted = highlightedId === item.id;
        return (
            <View
              key={item.id}
              collapsable={false}
              testID={`search-item-${item.id}`}
              onLayout={(event) => emitRowOffset(item.id, event.nativeEvent.layout.y)}
            style={[
              styles.itemWrapper,
              index < CONTENT_ITEMS.length - 1 && styles.itemSpacing,
              highlighted && {
                borderColor: accentColor,
                backgroundColor: hexToRGBA(accentColor, 0.15),
              },
            ]}
          >
            {renderContentButton(item.id)}
          </View>
        );
      })}
    </View>
  );

  function renderContentButton(id: ContentItemId) {
    switch (id) {
      case 'language':
        return (
          <ActionButton
            icon={TranslateIcon}
            label={t('settings.language')}
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
        );
      case 'region':
        return (
          <ActionButton
            icon={MapPinIcon}
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
        );
      case 'accentColor':
        return (
          <ActionButton
            icon={PaintBoardIcon}
            label={t('settings.accentColor')}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onColorPress();
            }}
            badge={
              <View style={[styles.languageBadge, styles.accentBadge]}>
                <View style={[styles.accentDot, { backgroundColor: accentColor }]} />
                <Text style={styles.languageBadgeText}>{accentLabel}</Text>
              </View>
            }
          />
        );
      case 'defaultLaunchScreen':
        return (
          <ActionButton
            icon={Layout01Icon}
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
        );
    }
  }
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
  itemWrapper: {
    borderWidth: 1,
    borderColor: COLORS.transparent,
    borderRadius: BORDER_RADIUS.l,
  },
  itemSpacing: {
    marginBottom: SPACING.s,
  },
  languageBadge: {
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
    marginLeft: SPACING.s,
  },
  accentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  accentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  languageBadgeText: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.semiBold,
  },
});
