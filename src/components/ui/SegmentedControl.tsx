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

export type SegmentedControlOption<K extends string = string> = {
  key: K;
  label: string;
};

interface SegmentedControlProps<K extends string> {
  options: ReadonlyArray<SegmentedControlOption<K>>;
  activeKey: K;
  onChange: (key: K) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl<K extends string>({
  options,
  activeKey,
  onChange,
  testID,
  style,
}: SegmentedControlProps<K>) {
  const { accentColor } = useAccentColor();

  return (
    <View style={[styles.container, style]} accessibilityRole="tablist" testID={testID}>
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
