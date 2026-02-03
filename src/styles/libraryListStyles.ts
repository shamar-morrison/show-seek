import { StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@/src/constants/theme';

export const libraryListStyles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: COLORS.surfaceLight,
  },
  listContent: {
    paddingHorizontal: SPACING.l,
    paddingTop: SPACING.m,
    paddingBottom: SPACING.xl,
  },
});
