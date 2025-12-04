import { Star } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../constants/theme';

interface RatingButtonProps {
  onPress: () => void;
  isRated?: boolean;
  isLoading?: boolean;
}

export default function RatingButton({
  onPress,
  isRated = false,
  isLoading = false,
}: RatingButtonProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <Star
          size={24}
          color={isRated ? COLORS.primary : COLORS.text}
          fill={isRated ? COLORS.primary : 'transparent'}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    padding: SPACING.s,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
