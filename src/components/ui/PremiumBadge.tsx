import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { Lock } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Standardized premium badge component for locked/premium features.
 * Uses Lock icon with primary color scheme.
 */
export const PremiumBadge: React.FC = () => {
  return (
    <View style={styles.premiumBadge}>
      <Lock size={10} color={COLORS.primary} />
      <Text style={styles.premiumBadgeText}>Premium</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.surfaceLight,
    paddingHorizontal: SPACING.s,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.s,
  },
  premiumBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
});
