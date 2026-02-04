import { StyleSheet } from 'react-native';
import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';

export const mediaCardStyles = StyleSheet.create({
  info: {
    marginTop: SPACING.s,
  },
  title: {
    color: COLORS.text,
    fontSize: FONT_SIZE.s,
    fontWeight: '600',
  },
});
