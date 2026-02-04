import { COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';
import { screenStyles } from '@/src/styles/screenStyles';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

interface FullScreenLoadingProps {
  color?: string;
  message?: string;
}

export function FullScreenLoading({ color = COLORS.primary, message }: FullScreenLoadingProps) {
  return (
    <View style={screenStyles.loadingContainer}>
      <ActivityIndicator size="large" color={color} />
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  message: {
    marginTop: SPACING.m,
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.s,
    textAlign: 'center',
  },
});
