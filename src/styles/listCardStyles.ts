import { StyleSheet } from 'react-native';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';

export const listCardStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: BORDER_RADIUS.m,
    borderWidth: 1,
    borderColor: COLORS.surfaceLight,
    padding: SPACING.s,
    gap: SPACING.m,
  },
  containerPressed: {
    opacity: ACTIVE_OPACITY,
  },
  poster: {
    width: 60,
    height: 90,
    borderRadius: BORDER_RADIUS.s,
    backgroundColor: COLORS.surfaceLight,
  },
  info: {
    flex: 1,
    gap: SPACING.xs,
  },
});
