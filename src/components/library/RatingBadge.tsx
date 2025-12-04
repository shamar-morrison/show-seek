import { BORDER_RADIUS, COLORS, FONT_SIZE } from '@/constants/theme';
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
    container: { paddingHorizontal: 6, paddingVertical: 3 },
    icon: 12,
    fontSize: 11,
  },
  medium: {
    container: { paddingHorizontal: 8, paddingVertical: 4 },
    icon: 14,
    fontSize: 13,
  },
  large: {
    container: { paddingHorizontal: 10, paddingVertical: 5 },
    icon: 16,
    fontSize: 15,
  },
};

export const RatingBadge = memo<RatingBadgeProps>(({ rating, size = 'medium', style }) => {
  const sizeConfig = SIZES[size];

  return (
    <View style={[styles.container, sizeConfig.container, style]}>
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
    backgroundColor: 'rgba(229, 9, 20, 0.9)',
    borderRadius: BORDER_RADIUS.m,
    gap: 4,
  },
  ratingText: {
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
