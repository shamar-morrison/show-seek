import { DEFAULT_LIST_IDS, LIST_INDICATOR_CONFIG } from '@/src/constants/listIndicators';
import { COLORS, SPACING } from '@/src/constants/theme';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface ListMembershipBadgeProps {
  /** List IDs this media item belongs to */
  listIds?: string[];
  /** Size of the badge - affects icon and container size */
  size?: 'small' | 'medium';
}

/**
 * Shows colored icons for each default list a media item belongs to.
 * Positioned absolutely in top-left corner - parent container should have position: 'relative'.
 */
export const ListMembershipBadge = memo<ListMembershipBadgeProps>(
  ({ listIds = [], size = 'small' }) => {
    // Filter to only show default lists that this item is in
    const visibleLists = DEFAULT_LIST_IDS.filter((id) => listIds.includes(id));

    if (visibleLists.length === 0) {
      return null;
    }

    const isSmall = size === 'small';
    const containerSize = isSmall ? 20 : 24;
    const iconSize = isSmall ? 10 : 12;

    return (
      <View style={styles.container}>
        {visibleLists.map((listId) => {
          const config = LIST_INDICATOR_CONFIG[listId];
          if (!config) return null;

          const IconComponent = config.icon;

          return (
            <View
              key={listId}
              style={[
                styles.badge,
                {
                  width: containerSize,
                  height: containerSize,
                  borderRadius: containerSize / 2,
                  backgroundColor: config.color,
                },
              ]}
            >
              <IconComponent size={iconSize} color={COLORS.white} fill={COLORS.white} />
            </View>
          );
        })}
      </View>
    );
  }
);

ListMembershipBadge.displayName = 'ListMembershipBadge';

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: SPACING.xs,
    left: SPACING.xs,
    flexDirection: 'row',
    gap: 4,
    flexWrap: 'wrap',
  },
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    // Add subtle shadow for visibility on light posters
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});

// ============================================
// Inline List Indicators (for search/discover cards)
// ============================================

interface InlineListIndicatorsProps {
  /** List IDs this media item belongs to */
  listIds: string[];
  /** Size of the icons */
  size?: 'small' | 'medium';
}

/**
 * Inline row of list indicator icons (not absolutely positioned).
 * Use below overview text in search/discover result cards.
 */
export const InlineListIndicators = memo<InlineListIndicatorsProps>(
  ({ listIds, size = 'small' }) => {
    // Filter to only show default lists that this item is in
    const visibleLists = DEFAULT_LIST_IDS.filter((id) => listIds.includes(id));

    if (visibleLists.length === 0) {
      return null;
    }

    const isSmall = size === 'small';
    const containerSize = isSmall ? 18 : 22;
    const iconSize = isSmall ? 10 : 12;

    return (
      <View style={inlineStyles.container}>
        {visibleLists.map((listId) => {
          const config = LIST_INDICATOR_CONFIG[listId];
          if (!config) return null;

          const IconComponent = config.icon;

          return (
            <View
              key={listId}
              style={[
                inlineStyles.badge,
                {
                  width: containerSize,
                  height: containerSize,
                  borderRadius: containerSize / 2,
                  backgroundColor: config.color,
                },
              ]}
            >
              <IconComponent size={iconSize} color={COLORS.white} fill={COLORS.white} />
            </View>
          );
        })}
      </View>
    );
  }
);

InlineListIndicators.displayName = 'InlineListIndicators';

const inlineStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: 4,
    marginTop: SPACING.s,
  },
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
