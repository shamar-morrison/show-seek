import { StyleSheet } from 'react-native';
import { COLORS, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';

export const useIconBadgeStyles = () => {
  const { accentColor } = useAccentColor();

  return StyleSheet.create({
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
      backgroundColor: accentColor,
    },
  });
};
