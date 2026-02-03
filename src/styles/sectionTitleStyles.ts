import { StyleSheet } from 'react-native';
import { COLORS, FONT_SIZE } from '@/src/constants/theme';

export const sectionTitleStyles = StyleSheet.create({
  title: {
    fontSize: FONT_SIZE.xs,
    fontWeight: '700',
    color: COLORS.textSecondary,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
