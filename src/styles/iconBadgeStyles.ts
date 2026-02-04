import { StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@/src/constants/theme';

export const iconBadgeStyles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -4,
    width: SPACING.s,
    height: SPACING.s,
    borderRadius: SPACING.xs,
    backgroundColor: COLORS.primary,
  },
});
