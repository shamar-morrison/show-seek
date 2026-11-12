import { TraktLogo } from '@/src/components/icons/TraktLogo';
import { ActionButton } from '@/src/components/profile/ActionButton';
import { BORDER_RADIUS, COLORS, hexToRGBA, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { sectionTitleStyles } from '@/src/styles/sectionTitleStyles';
import { Image } from 'expo-image';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { Tick02Icon } from '@hugeicons/core-free-icons';
import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

/** Stored (not rendered) category keys for integration items. */
export type IntegrationCategoryKey = 'import' | 'sync';

export type IntegrationItemId =
  | 'imdbImport'
  | 'tvtimeImport'
  | 'simklImport'
  | 'showlyImport'
  | 'trakt'
  | 'stremio';

export interface IntegrationConfigItem {
  /** Stable id (also used as the search/scroll id) */
  id: IntegrationItemId;
  /** Translation key for the title */
  titleKey: string;
  /** Translation key for the short description under the title */
  descKey: string;
  category: IntegrationCategoryKey;
}

export const INTEGRATION_ITEMS: IntegrationConfigItem[] = [
  {
    id: 'imdbImport',
    titleKey: 'profile.importFromImdb',
    descKey: 'profile.importFromImdbDescription',
    category: 'import',
  },
  {
    id: 'tvtimeImport',
    titleKey: 'profile.importFromTvTime',
    descKey: 'profile.importFromTvTimeDescription',
    category: 'import',
  },
  {
    id: 'simklImport',
    titleKey: 'profile.importFromSimkl',
    descKey: 'profile.importFromSimklDescription',
    category: 'import',
  },
  {
    id: 'showlyImport',
    titleKey: 'profile.importFromShowly',
    descKey: 'profile.importFromShowlyDescription',
    category: 'import',
  },
  {
    id: 'trakt',
    titleKey: 'profile.traktIntegration',
    descKey: 'profile.traktIntegrationDescription',
    category: 'sync',
  },
  {
    id: 'stremio',
    titleKey: 'profile.stremioIntegration',
    descKey: 'stremio.intro',
    category: 'sync',
  },
];

export interface IntegrationsSectionProps {
  /** Whether Trakt is connected */
  isTraktConnected: boolean;
  /** Whether Trakt status is loading */
  isTraktLoading: boolean;
  /** Handler for IMDb import button */
  onImdbImport: () => void;
  /** Handler for TV Time import button */
  onTvTimeImport: () => void;
  /** Handler for Simkl import button */
  onSimklImport: () => void;
  /** Handler for Showly import button */
  onShowlyImport: () => void;
  /** Handler for Trakt settings button press */
  onTraktPress: () => void;
  /** Whether a Stremio addon link is active (null while unknown) */
  isStremioConnected?: boolean | null;
  /** Handler for Stremio settings button press */
  onStremioPress: () => void;
  /** Whether to show section title (default: true) */
  showTitle?: boolean;
  /** Id of the item to briefly highlight (e.g. from profile search) */
  highlightedId?: string | null;
  /** Reports an item's content-relative Y-offset for scroll-to from profile search */
  registerItemLayout?: (id: string, y: number) => void;
}

/**
 * Profile section for third-party account and data integrations.
 */
export function IntegrationsSection({
  isTraktConnected,
  isTraktLoading,
  onImdbImport,
  onTvTimeImport,
  onSimklImport,
  onShowlyImport,
  onTraktPress,
  isStremioConnected = null,
  onStremioPress,
  showTitle = true,
  highlightedId = null,
  registerItemLayout,
}: IntegrationsSectionProps) {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

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
      testID="profile-integrations-root"
      onLayout={(event) => handleRootLayout(event.nativeEvent.layout.y)}
    >
      {showTitle && (
        <Text style={[sectionTitleStyles.title, styles.sectionTitle]}>
          {t('profile.tabs.integrations')}
        </Text>
      )}
      {INTEGRATION_ITEMS.map((item, index) => {
        const highlighted = highlightedId === item.id;
        return (
          <View
            key={item.id}
            collapsable={false}
            testID={`search-item-${item.id}`}
            onLayout={(event) => emitRowOffset(item.id, event.nativeEvent.layout.y)}
            style={[
              styles.itemWrapper,
              index < INTEGRATION_ITEMS.length - 1 && styles.itemSpacing,
              highlighted && {
                borderColor: accentColor,
                backgroundColor: hexToRGBA(accentColor, 0.15),
              },
            ]}
          >
            {renderIntegrationButton(item.id)}
          </View>
        );
      })}
    </View>
  );

  function renderIntegrationButton(id: IntegrationItemId) {
    switch (id) {
      case 'imdbImport':
        return (
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
            description={t('profile.importFromImdbDescription')}
            onPress={onImdbImport}
          />
        );
      case 'tvtimeImport':
        return (
          <ActionButton
            customIcon={
              <Image
                source={require('@/assets/images/tvtime.png')}
                contentFit="cover"
                style={styles.tvTimeLogo}
                testID="integrations-tvtime-icon"
              />
            }
            label={t('profile.importFromTvTime')}
            description={t('profile.importFromTvTimeDescription')}
            onPress={onTvTimeImport}
          />
        );
      case 'simklImport':
        return (
          <ActionButton
            customIcon={
              <Image
                source={require('@/assets/images/simkl.png')}
                contentFit="cover"
                style={styles.simklLogo}
                testID="integrations-simkl-icon"
              />
            }
            label={t('profile.importFromSimkl')}
            description={t('profile.importFromSimklDescription')}
            onPress={onSimklImport}
          />
        );
      case 'showlyImport':
        return (
          <ActionButton
            customIcon={
              <Image
                source={require('@/assets/images/showly.png')}
                contentFit="cover"
                style={styles.showlyLogo}
                testID="integrations-showly-icon"
              />
            }
            label={t('profile.importFromShowly')}
            description={t('profile.importFromShowlyDescription')}
            onPress={onShowlyImport}
          />
        );
      case 'trakt':
        return (
          <ActionButton
            customIcon={<TraktLogo size={21} />}
            label={t('profile.traktIntegration')}
            description={t('profile.traktIntegrationDescription')}
            onPress={onTraktPress}
            loading={isTraktLoading}
            badge={
              isTraktConnected ? (
                <View
                  style={styles.traktConnectedBadge}
                  testID="integrations-trakt-connected-badge"
                >
                  <AppIcon icon={Tick02Icon} size={12} color={COLORS.white} />
                </View>
              ) : null
            }
          />
        );
      case 'stremio':
        return (
          <ActionButton
            customIcon={
              <Image
                source={require('@/assets/images/stremio.png')}
                contentFit="contain"
                style={styles.stremioLogo}
                testID="integrations-stremio-icon"
              />
            }
            label={t('profile.stremioIntegration')}
            description={t('stremio.intro')}
            onPress={onStremioPress}
            testID="action-button-stremio-integration"
            badge={
              isStremioConnected === true ? (
                <View
                  style={styles.traktConnectedBadge}
                  testID="integrations-stremio-connected-badge"
                >
                  <AppIcon icon={Tick02Icon} size={12} color={COLORS.white} />
                </View>
              ) : null
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
  tvTimeLogo: {
    borderRadius: 5,
    height: 22,
    width: 22,
  },
  simklLogo: {
    borderRadius: 5,
    height: 22,
    width: 22,
  },
  showlyLogo: {
    borderRadius: 5,
    height: 22,
    width: 22,
  },
  stremioLogo: {
    height: 21,
    width: 21,
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
