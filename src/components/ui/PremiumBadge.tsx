import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { AppIcon } from '@/src/components/ui/AppIcon';
import { LockIcon } from '@hugeicons/core-free-icons';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Standardized premium badge component for locked/premium features.
 * Uses LockIcon icon with primary color scheme.
 */
export const PremiumBadge: React.FC = () => {
  const { t } = useTranslation();
  const { accentColor } = useAccentColor();

  return (
    <View style={styles.premiumBadge}>
      <AppIcon icon={LockIcon} size={10} color={accentColor} />
      <Text style={[styles.premiumBadgeText, { color: accentColor }]}>{t('common.premium')}</Text>
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
    fontWeight: '600',
  },
});
