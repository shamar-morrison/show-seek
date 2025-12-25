import { COLORS, SPACING } from '@/src/constants/theme';
import { Bookmark } from 'lucide-react-native';
import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

interface ListMembershipBadgeProps {
  /** Size of the badge - affects icon and container size */
  size?: 'small' | 'medium';
}

/**
 * A small badge indicator that shows a media item is already in one of the user's lists.
 * Positioned absolutely - parent container should have position: 'relative'.
 */
export const ListMembershipBadge = memo<ListMembershipBadgeProps>(({ size = 'small' }) => {
  const isSmall = size === 'small';
  const containerSize = isSmall ? 18 : 22;
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
      <Bookmark size={iconSize} color={COLORS.white} fill={COLORS.white} />
    </View>
  );
});

ListMembershipBadge.displayName = 'ListMembershipBadge';

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: SPACING.xs,
    right: SPACING.xs,
    backgroundColor: COLORS.primary,
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
