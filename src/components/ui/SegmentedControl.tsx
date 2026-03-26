import {
  ACTIVE_OPACITY,
  BORDER_RADIUS,
  COLORS,
  FONT_SIZE,
  SPACING,
} from '@/src/constants/theme';
import { useAccentColor } from '@/src/context/AccentColorProvider';
import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

export type SegmentedControlOption = {
  key: string;
  label: string;
};

interface SegmentedControlProps {
  options: SegmentedControlOption[];
  activeKey: string;
  onChange: (key: string) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl({
  options,
  activeKey,
  onChange,
  testID,
  style,
}: SegmentedControlProps) {
  const { accentColor } = useAccentColor();

  return (
    <View style={[styles.container, style]} testID={testID}>
      {options.map((option) => {
        const isActive = option.key === activeKey;

        return (
          <TouchableOpacity
            key={option.key}
            style={[styles.button, isActive && { backgroundColor: accentColor }]}
            onPress={() => onChange(option.key)}
            activeOpacity={ACTIVE_OPACITY}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected: isActive }}
            testID={testID ? `${testID}-tab-${option.key}` : undefined}
          >
            <Text style={[styles.text, isActive && styles.activeText]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    gap: SPACING.s,
  },
  button: {
    flex: 1,
    paddingVertical: SPACING.s,
    alignItems: 'center',
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
  },
  text: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeText: {
    color: COLORS.white,
  },
});
