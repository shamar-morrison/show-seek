import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import React from 'react';
import {
  ActivityIndicator,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

interface InlineUpdatingIndicatorProps {
  message: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function InlineUpdatingIndicator({ message, testID, style }: InlineUpdatingIndicatorProps) {
  const { accentColor } = useAccentColor();

  return (
    <View style={[styles.container, style]} testID={testID}>
      <ActivityIndicator size="small" color={accentColor} />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xs,
    gap: SPACING.s,
    backgroundColor: COLORS.surface,
  },
  text: {
    fontSize: FONT_SIZE.s,
    color: COLORS.textSecondary,
  },
});
