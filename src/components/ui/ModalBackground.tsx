import { COLORS } from '@/src/constants/theme';
import { BlurView } from 'expo-blur';
import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';

interface ModalBackgroundProps {
  intensity?: number;
}

/**
 * Cross-platform modal background component.
 * Uses BlurView on iOS for a premium blur effect.
 * Uses a semi-transparent overlay on Android to avoid flickering issues
 * that occur with expo-blur in production builds.
 */
export function ModalBackground({ intensity = 20 }: ModalBackgroundProps) {
  if (Platform.OS === 'ios') {
    return <BlurView intensity={intensity} style={StyleSheet.absoluteFill} tint="dark" />;
  }

  // On Android, use a semi-transparent overlay to avoid flickering
  // caused by expo-blur's non-hardware accelerated canvas
  return <View style={[StyleSheet.absoluteFill, styles.androidOverlay]} />;
}

const styles = StyleSheet.create({
  androidOverlay: {
    backgroundColor: COLORS.overlay,
  },
});
