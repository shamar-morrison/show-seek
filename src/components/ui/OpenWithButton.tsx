import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, SPACING } from '@/src/constants/theme';
import { ExternalLink } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface OpenWithButtonProps {
  onPress: () => void;
  rightOffset?: number;
}

export function OpenWithButton({ onPress, rightOffset = 58 }: OpenWithButtonProps) {
  return (
    <SafeAreaView style={[styles.headerSafe, { right: rightOffset }]} edges={['top']}>
      <TouchableOpacity
        style={styles.headerButton}
        onPress={onPress}
        activeOpacity={ACTIVE_OPACITY}
      >
        <ExternalLink size={20} color={COLORS.white} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headerSafe: {
    position: 'absolute',
    top: SPACING.s,
    zIndex: 10,
  },
  headerButton: {
    padding: 14,
    marginRight: 6,
    backgroundColor: COLORS.overlay,
    borderRadius: BORDER_RADIUS.round,
  },
});
