import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';
import { ACTIVE_OPACITY, BORDER_RADIUS, COLORS, FONT_SIZE, SPACING } from '@/src/constants/theme';

export interface TabSelectorOption<T extends string | number> {
  value: T;
  label: string;
  count?: number;
}

export interface TabSelectorProps<T extends string | number> {
  options: TabSelectorOption<T>[];
  value: T;
  onChange: (value: T) => void;
  scrollable?: boolean;
  style?: ViewStyle;
  showCounts?: boolean;
}

export function TabSelector<T extends string | number>({
  options,
  value,
  onChange,
  scrollable = false,
  style,
  showCounts = false,
}: TabSelectorProps<T>) {
  const renderOption = (option: TabSelectorOption<T>) => {
    const isActive = value === option.value;

    return (
      <TouchableOpacity
        key={String(option.value)}
        style={[
          styles.button,
          !scrollable && styles.fixedButton,
          isActive && styles.activeButton,
        ]}
        onPress={() => onChange(option.value)}
        activeOpacity={ACTIVE_OPACITY}
      >
        <Text style={[styles.buttonText, isActive && styles.activeButtonText]}>
          {option.label}
        </Text>
        {showCounts && option.count !== undefined && option.count > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{option.count}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (scrollable) {
    return (
      <View style={[styles.scrollableContainer, style]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollableContent}
        >
          {options.map(renderOption)}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.fixedContainer, style]}>
      {options.map(renderOption)}
    </View>
  );
}

const styles = StyleSheet.create({
  fixedContainer: {
    flexDirection: 'row',
    padding: SPACING.m,
    gap: SPACING.m,
  },
  scrollableContainer: {
    paddingTop: SPACING.m,
    marginBottom: SPACING.m,
  },
  scrollableContent: {
    paddingHorizontal: SPACING.l,
    gap: SPACING.m,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.m,
    paddingVertical: SPACING.s,
    borderRadius: BORDER_RADIUS.m,
    backgroundColor: COLORS.surface,
    gap: SPACING.s,
  },
  fixedButton: {
    flex: 1,
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    fontSize: FONT_SIZE.m,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeButtonText: {
    color: COLORS.white,
  },
  countBadge: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.round,
  },
  countText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontWeight: 'bold',
  },
});
