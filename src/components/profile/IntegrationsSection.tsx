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

export type IntegrationItemId = 'imdbImport' | 'trakt';

export interface IntegrationConfigItem {
  /** Stable id (also used as the search/scroll id) */
  id: IntegrationItemId;
  /** Translation key for the title */
  titleKey: string;
  category: IntegrationCategoryKey;
}

export const INTEGRATION_ITEMS: IntegrationConfigItem[] = [
  { id: 'imdbImport', titleKey: 'profile.importFromImdb', category: 'import' },
  { id: 'trakt', titleKey: 'profile.traktIntegration', category: 'sync' },
];

export interface IntegrationsSectionProps {
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
  onTraktPress,
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
            onPress={onImdbImport}
          />
        );
      case 'trakt':
        return (
          <ActionButton
            customIcon={<TraktLogo size={21} />}
            label={t('profile.traktIntegration')}
            onPress={onTraktPress}
            loading={isTraktLoading}
            badge={
              isTraktConnected ? (
                <View style={styles.traktConnectedBadge} testID="integrations-trakt-connected-badge">
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
