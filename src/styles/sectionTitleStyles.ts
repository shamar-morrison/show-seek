import { StyleSheet } from 'react-native';
import { COLORS, FONT_FAMILY, FONT_SIZE } from '@/src/constants/theme';

export const sectionTitleStyles = StyleSheet.create({
  title: {
    fontSize: FONT_SIZE.xs,
    fontFamily: FONT_FAMILY.bold,
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
