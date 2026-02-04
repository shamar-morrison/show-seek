import { BORDER_RADIUS, COLORS, FONT_SIZE, SPACING, hexToRGBA } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Star } from 'lucide-react-native';
import React, { memo } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';

interface RatingBadgeProps {
  rating: number;
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
}

const SIZES = {
  small: {
    container: { paddingHorizontal: SPACING.s, paddingVertical: SPACING.xs },
    icon: 12,
    fontSize: FONT_SIZE.xs,
  },
  medium: {
    container: { paddingHorizontal: SPACING.s, paddingVertical: SPACING.xs },
    icon: 14,
    fontSize: FONT_SIZE.s,
  },
  large: {
    container: { paddingHorizontal: SPACING.m, paddingVertical: SPACING.s },
    icon: 16,
    fontSize: FONT_SIZE.m,
  },
};

export const RatingBadge = memo<RatingBadgeProps>(({ rating, size = 'medium', style }) => {
  const sizeConfig = SIZES[size];
  const { accentColor } = useAccentColor();

  return (
    <View
      style={[
        styles.container,
        sizeConfig.container,
        style,
        { backgroundColor: hexToRGBA(accentColor, 0.9) },
      ]}
    >
      <Star size={sizeConfig.icon} color={COLORS.warning} fill={COLORS.warning} />
      <Text style={[styles.ratingText, { fontSize: sizeConfig.fontSize }]}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
});

RatingBadge.displayName = 'RatingBadge';

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    gap: 4,
  },
  ratingText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
