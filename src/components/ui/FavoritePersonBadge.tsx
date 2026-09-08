import { LIST_INDICATOR_COLORS } from '@/src/constants/listIndicators';
import { COLORS, SPACING } from '@/src/constants/theme';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { FavouriteIcon } from '@hugeicons/core-free-icons';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface FavoritePersonBadgeProps {
  /** Size of the badge - affects icon and container size */
  size?: 'small' | 'medium';
}

/**
 * FavouriteIcon icon badge to indicate a person is in the user's favorites.
 * Positioned absolutely in the top-right corner.
 * Parent container should have position: 'relative'.
 */
export const FavoritePersonBadge = memo<FavoritePersonBadgeProps>(({ size = 'small' }) => {
  const isSmall = size === 'small';
  const containerSize = isSmall ? 20 : 24;
  const iconSize = isSmall ? 10 : 12;

  return (
    <View
      style={[
        styles.badge,
        {
          width: containerSize,
          height: containerSize,
          borderRadius: containerSize / 2,
        },
      ]}
    >
      <AppIcon icon={FavouriteIcon} size={iconSize} color={COLORS.white} fill={COLORS.white} />
    </View>
  );
});

FavoritePersonBadge.displayName = 'FavoritePersonBadge';

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: LIST_INDICATOR_COLORS.favorites,
    justifyContent: 'center',
    alignItems: 'center',
    // Add subtle shadow for visibility on light backgrounds
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
});
