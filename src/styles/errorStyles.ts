import { StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@/src/constants/theme';

export const errorStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  text: {
    color: COLORS.error,
    marginBottom: SPACING.m,
  },
});
