import { COLORS } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import { Star } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, TouchableOpacity } from 'react-native';

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
  const { accentColor } = useAccentColor();
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={isLoading}
    >
      {isLoading ? (
        <ActivityIndicator size="small" color={accentColor} />
      ) : (
        <Star
          size={24}
          color={isRated ? accentColor : COLORS.text}
          fill={isRated ? accentColor : 'transparent'}
        />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
